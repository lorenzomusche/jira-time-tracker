import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createRouter, protectedProcedure, credentialsFor } from "../middleware";
import { getDb } from "../queries/connection";
import { issues, worklogs } from "@db/schema";
import {
  fetchAssignedIssues,
  fetchIssueByKey,
  searchIssues,
  fetchTransitions,
  doTransition,
  type JiraSearchedIssue,
} from "../jira/client";

function toRow(userId: number, siteUrl: string, i: JiraSearchedIssue) {
  return {
    userId,
    jiraId: i.id,
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name ?? "Unknown",
    statusCategory: i.fields.status?.statusCategory?.name ?? "",
    projectKey: i.fields.project?.key ?? "",
    projectName: i.fields.project?.name ?? "",
    issueType: i.fields.issuetype?.name ?? "",
    priority: i.fields.priority?.name ?? "",
    labels: JSON.stringify(i.fields.labels ?? []),
    assigneeId: i.fields.assignee?.accountId ?? i.fields.assignee?.name ?? "",
    timeEstimateSeconds: i.fields.timeestimate ?? null,
    timeSpentSeconds: i.fields.timespent ?? null,
    dueDate: i.fields.duedate ?? null,
    jiraUpdated: i.fields.updated ?? null,
    url: `${siteUrl}/browse/${i.key}`,
    syncedAt: new Date(),
  };
}

async function upsertIssue(userId: number, siteUrl: string, i: JiraSearchedIssue) {
  const db = getDb();
  const row = toRow(userId, siteUrl, i);
  await db
    .insert(issues)
    .values(row)
    .onConflictDoUpdate({ target: [issues.userId, issues.key], set: row });
}

/** JQL for free-text global search: exact key, or full-text match. */
export function buildSearchJql(query: string): string {
  const q = query.trim();
  if (/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(q)) {
    return `key = ${q.toUpperCase()}`;
  }
  const escaped = q.replace(/["\\]/g, " ");
  return `text ~ "${escaped}" ORDER BY updated DESC`;
}

export const issuesRouter = createRouter({
  /** Pull assigned issues from Jira and upsert them locally. */
  sync: protectedProcedure.mutation(async ({ ctx }) => {
    const creds = credentialsFor(ctx.user);
    const remote = await fetchAssignedIssues(creds);
    for (const i of remote) {
      await upsertIssue(ctx.user.id, ctx.user.siteUrl, i);
    }
    return { synced: remote.length, at: new Date() };
  }),

  /** Global Jira search (any issue, not only assigned). Not stored locally. */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2) }))
    .query(async ({ ctx, input }) => {
      const creds = credentialsFor(ctx.user);
      const remote = await searchIssues(creds, buildSearchJql(input.query), 25);
      const db = getDb();
      const local = await db
        .select({ key: issues.key })
        .from(issues)
        .where(eq(issues.userId, ctx.user.id));
      const localKeys = new Set(local.map((l) => l.key));
      return remote.map((i) => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name ?? "Unknown",
        statusCategory: i.fields.status?.statusCategory?.name ?? "",
        projectKey: i.fields.project?.key ?? "",
        issueType: i.fields.issuetype?.name ?? "",
        priority: i.fields.priority?.name ?? "",
        labels: i.fields.labels ?? [],
        assignee: i.fields.assignee?.displayName ?? null,
        isMine:
          (i.fields.assignee?.accountId ?? i.fields.assignee?.name ?? "") ===
          ctx.user.accountId,
        imported: localKeys.has(i.key),
        url: `${ctx.user.siteUrl}/browse/${i.key}`,
      }));
    }),

  /** Import a single issue (any assignee) into the local catalog. */
  import: protectedProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const creds = credentialsFor(ctx.user);
      const remote = await fetchIssueByKey(creds, input.key.toUpperCase());
      if (!remote) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Issue ${input.key} non trovata su Jira`,
        });
      }
      await upsertIssue(ctx.user.id, ctx.user.siteUrl, remote);
      return { imported: remote.key };
    }),

  /** Delete local issues that have no tracked worklog history. */
  cleanup: protectedProcedure.mutation(async ({ ctx }) => {
    const db = getDb();
    const tracked = await db
      .select({ issueKey: worklogs.issueKey })
      .from(worklogs)
      .where(eq(worklogs.userId, ctx.user.id))
      .groupBy(worklogs.issueKey);
    const trackedKeys = new Set(tracked.map((t) => t.issueKey));

    const local = await db
      .select({ id: issues.id, key: issues.key })
      .from(issues)
      .where(eq(issues.userId, ctx.user.id));
    const toDelete = local.filter((l) => !trackedKeys.has(l.key)).map((l) => l.id);

    if (toDelete.length > 0) {
      await db.delete(issues).where(inArray(issues.id, toDelete));
    }
    return { deleted: toDelete.length, kept: local.length - toDelete.length };
  }),

  /** Move an issue to a new status via a Jira transition, then refresh locally. */
  transition: protectedProcedure
    .input(z.object({ key: z.string(), toStatus: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creds = credentialsFor(ctx.user);
      const transitions = await fetchTransitions(creds, input.key);
      const target = transitions.find(
        (t) =>
          t.to?.name?.toLowerCase() === input.toStatus.toLowerCase() ||
          t.name.toLowerCase() === input.toStatus.toLowerCase(),
      );
      if (!target) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nessuna transizione disponibile verso "${input.toStatus}" per ${input.key}`,
        });
      }
      await doTransition(creds, input.key, target.id);
      const refreshed = await fetchIssueByKey(creds, input.key);
      if (refreshed) await upsertIssue(ctx.user.id, ctx.user.siteUrl, refreshed);
      return { moved: input.key, to: refreshed?.fields.status?.name ?? input.toStatus };
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          projectKey: z.string().optional(),
          label: z.string().optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(issues.userId, ctx.user.id)];
      if (input?.status) conds.push(eq(issues.status, input.status));
      if (input?.projectKey) conds.push(eq(issues.projectKey, input.projectKey));
      if (input?.label) conds.push(sql`${issues.labels} LIKE ${"%" + input.label + "%"}`);
      if (input?.search) {
        const q = `%${input.search}%`;
        conds.push(
          sql`(${issues.summary} LIKE ${q} OR ${issues.key} LIKE ${q})`,
        );
      }

      const rows = await db
        .select()
        .from(issues)
        .where(and(...conds))
        .orderBy(desc(issues.jiraUpdated));

      const facets = await db
        .select({
          status: issues.status,
          projectKey: issues.projectKey,
          projectName: issues.projectName,
          labels: issues.labels,
          count: sql<number>`count(*)`,
        })
        .from(issues)
        .where(eq(issues.userId, ctx.user.id))
        .groupBy(issues.status, issues.projectKey, issues.projectName, issues.labels);

      const statuses = [...new Set(facets.map((f) => f.status))].sort();
      const projectsMap = new Map<string, string>();
      const labelsSet = new Set<string>();
      for (const f of facets) {
        projectsMap.set(f.projectKey, f.projectName);
        try {
          for (const l of JSON.parse(f.labels) as string[]) labelsSet.add(l);
        } catch {
          /* ignore malformed label payloads */
        }
      }
      const projects = [...projectsMap.entries()]
        .map(([key, name]) => ({ key, name }))
        .sort((a, b) => a.key.localeCompare(b.key));

      return {
        issues: rows.map((r) => ({
          ...r,
          labels: safeParseLabels(r.labels),
          isMine: r.assigneeId === ctx.user.accountId,
        })),
        statuses,
        projects,
        labels: [...labelsSet].sort(),
      };
    }),

  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(issues)
        .where(and(eq(issues.userId, ctx.user.id), eq(issues.key, input.key)))
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Issue non trovata" });
      }
      return { ...rows[0], labels: safeParseLabels(rows[0].labels) };
    }),
});

function safeParseLabels(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
