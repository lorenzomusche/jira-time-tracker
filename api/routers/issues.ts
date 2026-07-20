import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { createRouter, protectedProcedure, credentialsFor } from "../middleware";
import { getDb } from "../queries/connection";
import { issues } from "@db/schema";
import { fetchAssignedIssues, type JiraSearchedIssue } from "../jira/client";

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
    timeEstimateSeconds: i.fields.timeestimate ?? null,
    timeSpentSeconds: i.fields.timespent ?? null,
    dueDate: i.fields.duedate ?? null,
    jiraUpdated: i.fields.updated ?? null,
    url: `${siteUrl}/browse/${i.key}`,
    syncedAt: new Date(),
  };
}

export const issuesRouter = createRouter({
  /** Pull assigned issues from Jira and upsert them locally. */
  sync: protectedProcedure.mutation(async ({ ctx }) => {
    const creds = credentialsFor(ctx.user);
    const remote = await fetchAssignedIssues(creds);
    const db = getDb();

    for (const i of remote) {
      const row = toRow(ctx.user.id, ctx.user.siteUrl, i);
      await db
        .insert(issues)
        .values(row)
        .onConflictDoUpdate({
          target: [issues.userId, issues.key],
          set: row,
        });
    }
    return { synced: remote.length, at: new Date() };
  }),

  list: protectedProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          projectKey: z.string().optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(issues.userId, ctx.user.id)];
      if (input?.status) conds.push(eq(issues.status, input.status));
      if (input?.projectKey) conds.push(eq(issues.projectKey, input.projectKey));
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
          count: sql<number>`count(*)`,
        })
        .from(issues)
        .where(eq(issues.userId, ctx.user.id))
        .groupBy(issues.status, issues.projectKey, issues.projectName);

      const statuses = [...new Set(facets.map((f) => f.status))].sort();
      const projectsMap = new Map<string, string>();
      for (const f of facets) projectsMap.set(f.projectKey, f.projectName);
      const projects = [...projectsMap.entries()]
        .map(([key, name]) => ({ key, name }))
        .sort((a, b) => a.key.localeCompare(b.key));

      return { issues: rows, statuses, projects };
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
      return rows[0];
    }),
});
