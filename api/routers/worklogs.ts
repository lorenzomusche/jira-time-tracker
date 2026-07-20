import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { createRouter, protectedProcedure, credentialsFor } from "../middleware";
import { getDb } from "../queries/connection";
import { worklogs } from "@db/schema";
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

function rowFromJira(
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
      const db = getDb();
      // Cloud matches on accountId; Server/DC 8.x exposes the author "name"
      const mine = remote.filter(
        (w) =>
          (!w.author?.accountId && !w.author?.name) ||
          w.author.accountId === ctx.user.accountId ||
          w.author.name === ctx.user.accountId,
      );
      for (const w of mine) {
        const row = rowFromJira(ctx.user.id, input.issueKey, w);
        await db
          .insert(worklogs)
          .values(row)
          .onConflictDoUpdate({
            target: [worklogs.userId, worklogs.issueKey, worklogs.jiraWorklogId],
            set: row,
          });
      }
      return { synced: mine.length };
    }),

  /** Log time on Jira and store the worklog locally. */
  create: protectedProcedure
    .input(logInput)
    .mutation(async ({ ctx, input }) => {
      const { seconds, started } = parseLogInput(input);
      const creds = credentialsFor(ctx.user);
      const created = await addWorklog(creds, input.issueKey, {
        timeSpentSeconds: seconds,
        started: toJiraStarted(started),
        comment: input.comment,
      });
      const db = getDb();
      const row = rowFromJira(ctx.user.id, input.issueKey, created);
      const inserted = await db
        .insert(worklogs)
        .values(row)
        .onConflictDoUpdate({
          target: [worklogs.userId, worklogs.issueKey, worklogs.jiraWorklogId],
          set: row,
        })
        .returning();
      return inserted[0];
    }),

  update: protectedProcedure
    .input(logInput.extend({ jiraWorklogId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { seconds, started } = parseLogInput(input);
      const creds = credentialsFor(ctx.user);
      const updated = await updateWorklog(creds, input.issueKey, input.jiraWorklogId, {
        timeSpentSeconds: seconds,
        started: toJiraStarted(started),
        comment: input.comment,
      });
      const db = getDb();
      const row = rowFromJira(ctx.user.id, input.issueKey, updated);
      const saved = await db
        .insert(worklogs)
        .values(row)
        .onConflictDoUpdate({
          target: [worklogs.userId, worklogs.issueKey, worklogs.jiraWorklogId],
          set: row,
        })
        .returning();
      return saved[0];
    }),

  delete: protectedProcedure
    .input(z.object({ issueKey: z.string(), jiraWorklogId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creds = credentialsFor(ctx.user);
      await deleteWorklog(creds, input.issueKey, input.jiraWorklogId);
      const db = getDb();
      await db
        .delete(worklogs)
        .where(
          and(
            eq(worklogs.userId, ctx.user.id),
            eq(worklogs.issueKey, input.issueKey),
            eq(worklogs.jiraWorklogId, input.jiraWorklogId),
          ),
        );
      return { ok: true };
    }),
});
