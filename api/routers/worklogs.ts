import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { createRouter, protectedProcedure, credentialsFor } from "../middleware";
import { getDb } from "../queries/connection";
import { outbox, worklogs } from "@db/schema";
import {
  addWorklog,
  updateWorklog,
  deleteWorklog,
  fetchWorklogs,
  textFromAdf,
  type JiraWorklog,
} from "../jira/client";
import { parseDurationToSeconds, toJiraStarted } from "@contracts/time";

const logInput = z.object({
  issueKey: z.string().min(1),
  /** Jira-style duration, e.g. "2h 30m", "1d", "45m" */
  timeSpent: z.string().min(1),
  /** ISO date/datetime string */
  started: z.string().min(1),
  comment: z.string().default(""),
});

/** Local placeholder id for worklogs queued in the offline outbox. */
export const PENDING_PREFIX = "pending-";

export function isPendingId(jiraWorklogId: string): boolean {
  return jiraWorklogId.startsWith(PENDING_PREFIX);
}

export function pendingOutboxId(jiraWorklogId: string): number {
  return parseInt(jiraWorklogId.slice(PENDING_PREFIX.length), 10);
}

/** fetch() throws TypeError when the host is unreachable; JiraApiError means Jira answered. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}

function parseLogInput(input: z.infer<typeof logInput>) {
  const seconds = parseDurationToSeconds(input.timeSpent);
  if (!seconds || seconds <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Durata non valida: "${input.timeSpent}". Usa formati come "2h 30m", "1d", "45m".`,
    });
  }
  const started = new Date(input.started);
  if (isNaN(started.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Data di inizio non valida" });
  }
  return { seconds, started };
}

export function rowFromJira(
  userId: number,
  issueKey: string,
  w: JiraWorklog,
) {
  return {
    userId,
    issueKey,
    jiraWorklogId: w.id,
    timeSpentSeconds: w.timeSpentSeconds,
    started: new Date(w.started),
    comment: textFromAdf(w.comment).trim(),
    authorAccountId: w.author?.accountId ?? "",
    jiraCreated: w.created ?? null,
    jiraUpdated: w.updated ?? null,
    syncedAt: new Date(),
  };
}

async function upsertLocal(row: ReturnType<typeof rowFromJira>) {
  const db = getDb();
  const saved = await db
    .insert(worklogs)
    .values(row)
    .onConflictDoUpdate({
      target: [worklogs.userId, worklogs.issueKey, worklogs.jiraWorklogId],
      set: row,
    })
    .returning();
  return saved[0];
}

async function updateLocalWorklog(
  userId: number,
  issueKey: string,
  jiraWorklogId: string,
  fields: { timeSpentSeconds: number; started: Date; comment: string },
) {
  const db = getDb();
  const saved = await db
    .update(worklogs)
    .set(fields)
    .where(
      and(
        eq(worklogs.userId, userId),
        eq(worklogs.issueKey, issueKey),
        eq(worklogs.jiraWorklogId, jiraWorklogId),
      ),
    )
    .returning();
  return saved[0];
}

async function deleteLocalWorklog(userId: number, issueKey: string, jiraWorklogId: string) {
  const db = getDb();
  await db
    .delete(worklogs)
    .where(
      and(
        eq(worklogs.userId, userId),
        eq(worklogs.issueKey, issueKey),
        eq(worklogs.jiraWorklogId, jiraWorklogId),
      ),
    );
}

export const worklogsRouter = createRouter({
  /** List local worklogs, optionally filtered by issue or date range. */
  list: protectedProcedure
    .input(
      z
        .object({
          issueKey: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(worklogs.userId, ctx.user.id)];
      if (input?.issueKey) conds.push(eq(worklogs.issueKey, input.issueKey));
      if (input?.from) conds.push(gte(worklogs.started, new Date(input.from)));
      if (input?.to) conds.push(lte(worklogs.started, new Date(input.to)));
      return db
        .select()
        .from(worklogs)
        .where(and(...conds))
        .orderBy(desc(worklogs.started));
    }),

  /** Pull worklogs of one issue from Jira and upsert locally. */
  syncIssue: protectedProcedure
    .input(z.object({ issueKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creds = credentialsFor(ctx.user);
      const remote = await fetchWorklogs(creds, input.issueKey);
      // Cloud matches on accountId; Server/DC 8.x exposes the author "name"
      const mine = remote.filter(
        (w) =>
          (!w.author?.accountId && !w.author?.name) ||
          w.author.accountId === ctx.user.accountId ||
          w.author.name === ctx.user.accountId,
      );
      for (const w of mine) {
        await upsertLocal(rowFromJira(ctx.user.id, input.issueKey, w));
      }
      return { synced: mine.length };
    }),

  /**
   * Log time on Jira and store the worklog locally.
   * If Jira is unreachable the operation is queued in the outbox and the
   * worklog is stored locally with a "pending-N" placeholder id.
   */
  create: protectedProcedure
    .input(logInput)
    .mutation(async ({ ctx, input }) => {
      const { seconds, started } = parseLogInput(input);
      const creds = credentialsFor(ctx.user);
      try {
        const created = await addWorklog(creds, input.issueKey, {
          timeSpentSeconds: seconds,
          started: toJiraStarted(started),
          comment: input.comment,
        });
        return await upsertLocal(rowFromJira(ctx.user.id, input.issueKey, created));
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        const db = getDb();
        const [entry] = await db
          .insert(outbox)
          .values({
            userId: ctx.user.id,
            kind: "create",
            issueKey: input.issueKey,
            timeSpentSeconds: seconds,
            started,
            comment: input.comment,
          })
          .returning();
        const saved = await db
          .insert(worklogs)
          .values({
            userId: ctx.user.id,
            issueKey: input.issueKey,
            jiraWorklogId: `${PENDING_PREFIX}${entry.id}`,
            timeSpentSeconds: seconds,
            started,
            comment: input.comment,
            authorAccountId: ctx.user.accountId,
            jiraCreated: null,
            jiraUpdated: null,
            syncedAt: new Date(),
          })
          .returning();
        return saved[0];
      }
    }),

  update: protectedProcedure
    .input(logInput.extend({ jiraWorklogId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { seconds, started } = parseLogInput(input);
      const fields = { timeSpentSeconds: seconds, started, comment: input.comment };
      // Pending worklog: it never reached Jira — just update the local copy
      // and the queued "create" operation.
      if (isPendingId(input.jiraWorklogId)) {
        const db = getDb();
        const oid = pendingOutboxId(input.jiraWorklogId);
        await db
          .update(outbox)
          .set(fields)
          .where(and(eq(outbox.id, oid), eq(outbox.userId, ctx.user.id)));
        return await updateLocalWorklog(ctx.user.id, input.issueKey, input.jiraWorklogId, fields);
      }
      const creds = credentialsFor(ctx.user);
      try {
        const updated = await updateWorklog(creds, input.issueKey, input.jiraWorklogId, {
          timeSpentSeconds: seconds,
          started: toJiraStarted(started),
          comment: input.comment,
        });
        return await upsertLocal(rowFromJira(ctx.user.id, input.issueKey, updated));
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        await getDb().insert(outbox).values({
          userId: ctx.user.id,
          kind: "update",
          issueKey: input.issueKey,
          jiraWorklogId: input.jiraWorklogId,
          timeSpentSeconds: seconds,
          started,
          comment: input.comment,
        });
        // Optimistic local update; replay will confirm against Jira.
        return await updateLocalWorklog(ctx.user.id, input.issueKey, input.jiraWorklogId, fields);
      }
    }),

  delete: protectedProcedure
    .input(z.object({ issueKey: z.string(), jiraWorklogId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // Pending worklog: drop the queued operation, nothing to do on Jira.
      if (isPendingId(input.jiraWorklogId)) {
        const db = getDb();
        const oid = pendingOutboxId(input.jiraWorklogId);
        await db
          .delete(outbox)
          .where(and(eq(outbox.id, oid), eq(outbox.userId, ctx.user.id)));
        await deleteLocalWorklog(ctx.user.id, input.issueKey, input.jiraWorklogId);
        return { ok: true };
      }
      const creds = credentialsFor(ctx.user);
      try {
        await deleteWorklog(creds, input.issueKey, input.jiraWorklogId);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        await db.insert(outbox).values({
          userId: ctx.user.id,
          kind: "delete",
          issueKey: input.issueKey,
          jiraWorklogId: input.jiraWorklogId,
        });
      }
      await deleteLocalWorklog(ctx.user.id, input.issueKey, input.jiraWorklogId);
      return { ok: true };
    }),
});
