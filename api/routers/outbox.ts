import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { createRouter, protectedProcedure, credentialsFor } from "../middleware";
import { getDb } from "../queries/connection";
import { issues, outbox, worklogs } from "@db/schema";
import {
  addWorklog,
  updateWorklog,
  deleteWorklog,
  JiraApiError,
} from "../jira/client";
import type { JiraCredentials } from "@contracts/types";
import { toJiraStarted } from "@contracts/time";
import {
  PENDING_PREFIX,
  isNetworkError,
  rowFromJira,
} from "./worklogs";

/**
 * Replay every queued operation against Jira, oldest first.
 * Stops at the first network error (Jira still unreachable); Jira-side
 * errors are recorded on the entry so the user can inspect or discard them.
 */
export async function replayOutbox(
  userId: number,
  creds: JiraCredentials,
): Promise<{ synced: number; failed: number; remaining: number }> {
  const db = getDb();
  const entries = await db
    .select()
    .from(outbox)
    .where(eq(outbox.userId, userId))
    .orderBy(asc(outbox.createdAt), asc(outbox.id));
  let synced = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      if (entry.kind === "create") {
        const created = await addWorklog(creds, entry.issueKey, {
          timeSpentSeconds: entry.timeSpentSeconds,
          started: toJiraStarted(entry.started ?? new Date()),
          comment: entry.comment,
        });
        // Replace the pending local row with the real Jira worklog.
        await db
          .delete(worklogs)
          .where(
            and(
              eq(worklogs.userId, userId),
              eq(worklogs.issueKey, entry.issueKey),
              eq(worklogs.jiraWorklogId, `${PENDING_PREFIX}${entry.id}`),
            ),
          );
        const row = rowFromJira(userId, entry.issueKey, created);
        await db
          .insert(worklogs)
          .values(row)
          .onConflictDoUpdate({
            target: [worklogs.userId, worklogs.issueKey, worklogs.jiraWorklogId],
            set: row,
          });
      } else if (entry.kind === "update") {
        const updated = await updateWorklog(creds, entry.issueKey, entry.jiraWorklogId, {
          timeSpentSeconds: entry.timeSpentSeconds,
          started: toJiraStarted(entry.started ?? new Date()),
          comment: entry.comment,
        });
        const row = rowFromJira(userId, entry.issueKey, updated);
        await db
          .insert(worklogs)
          .values(row)
          .onConflictDoUpdate({
            target: [worklogs.userId, worklogs.issueKey, worklogs.jiraWorklogId],
            set: row,
          });
      } else if (entry.kind === "delete") {
        try {
          await deleteWorklog(creds, entry.issueKey, entry.jiraWorklogId);
        } catch (e) {
          // Already gone on Jira (e.g. deleted from the web UI): that's fine.
          if (!(e instanceof JiraApiError && e.status === 404)) throw e;
        }
      } else {
        throw new Error(`Operazione outbox sconosciuta: ${entry.kind}`);
      }
      await db.delete(outbox).where(eq(outbox.id, entry.id));
      synced++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(outbox)
        .set({ attempts: entry.attempts + 1, lastError: msg.slice(0, 500) })
        .where(eq(outbox.id, entry.id));
      // Still offline: no point trying the rest of the queue now.
      if (isNetworkError(e)) break;
    }
  }
  const remaining = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(eq(outbox.userId, userId));
  return { synced, failed, remaining: remaining.length };
}

export const outboxRouter = createRouter({
  /** Queued operations, joined with the issue summary for display. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({
        id: outbox.id,
        kind: outbox.kind,
        issueKey: outbox.issueKey,
        jiraWorklogId: outbox.jiraWorklogId,
        timeSpentSeconds: outbox.timeSpentSeconds,
        started: outbox.started,
        comment: outbox.comment,
        attempts: outbox.attempts,
        lastError: outbox.lastError,
        createdAt: outbox.createdAt,
        issueSummary: issues.summary,
      })
      .from(outbox)
      .leftJoin(
        issues,
        and(eq(issues.userId, outbox.userId), eq(issues.key, outbox.issueKey)),
      )
      .where(eq(outbox.userId, ctx.user.id))
      .orderBy(asc(outbox.createdAt), asc(outbox.id));
    return rows;
  }),

  /** Replay the whole queue against Jira. */
  retry: protectedProcedure.mutation(async ({ ctx }) => {
    const creds = credentialsFor(ctx.user);
    return replayOutbox(ctx.user.id, creds);
  }),

  /**
   * Drop a queued operation. For pending creates the local placeholder
   * worklog is removed too (it never existed on Jira).
   */
  discard: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [entry] = await db
        .select()
        .from(outbox)
        .where(and(eq(outbox.id, input.id), eq(outbox.userId, ctx.user.id)));
      if (entry?.kind === "create") {
        await db
          .delete(worklogs)
          .where(
            and(
              eq(worklogs.userId, ctx.user.id),
              eq(worklogs.issueKey, entry.issueKey),
              eq(worklogs.jiraWorklogId, `${PENDING_PREFIX}${entry.id}`),
            ),
          );
      }
      await db
        .delete(outbox)
        .where(and(eq(outbox.id, input.id), eq(outbox.userId, ctx.user.id)));
      return { ok: true };
    }),
});
