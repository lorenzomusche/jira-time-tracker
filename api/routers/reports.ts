import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { issues, worklogs } from "@db/schema";

export const reportsRouter = createRouter({
  /**
   * Worklog report for a date range, grouped by day, issue or project.
   * Includes per-group totals and a grand total.
   */
  generate: protectedProcedure
    .input(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        groupBy: z.enum(["day", "issue", "project"]).default("day"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const from = new Date(input.from);
      const to = new Date(input.to);
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Intervallo date non valido" });
      }
      const db = getDb();
      const baseConds = [
        eq(worklogs.userId, ctx.user.id),
        gte(worklogs.started, from),
        lt(worklogs.started, to),
      ];

      if (input.groupBy === "day") {
        const rows = await db
          .select({
            group: sql<string>`date(${worklogs.started} / 1000, 'unixepoch', 'localtime')`,
            seconds: sql<number>`sum(${worklogs.timeSpentSeconds})`,
            entries: sql<number>`count(*)`,
          })
          .from(worklogs)
          .where(and(...baseConds))
          .groupBy(sql`date(${worklogs.started} / 1000, 'unixepoch', 'localtime')`)
          .orderBy(sql`1`);
        return {
          groupBy: input.groupBy,
          rows: rows.map((r) => ({ key: r.group, label: r.group, seconds: r.seconds, entries: r.entries })),
          totalSeconds: rows.reduce((a, r) => a + r.seconds, 0),
          totalEntries: rows.reduce((a, r) => a + r.entries, 0),
        };
      }

      if (input.groupBy === "issue") {
        const rows = await db
          .select({
            group: worklogs.issueKey,
            summary: sql<string>`max(${issues.summary})`,
            seconds: sql<number>`sum(${worklogs.timeSpentSeconds})`,
            entries: sql<number>`count(*)`,
          })
          .from(worklogs)
          .leftJoin(
            issues,
            and(eq(worklogs.userId, issues.userId), eq(worklogs.issueKey, issues.key)),
          )
          .where(and(...baseConds))
          .groupBy(worklogs.issueKey)
          .orderBy(sql`3 desc`);
        return {
          groupBy: input.groupBy,
          rows: rows.map((r) => ({
            key: r.group,
            label: r.summary ? `${r.group} — ${r.summary}` : r.group,
            seconds: r.seconds,
            entries: r.entries,
          })),
          totalSeconds: rows.reduce((a, r) => a + r.seconds, 0),
          totalEntries: rows.reduce((a, r) => a + r.entries, 0),
        };
      }

      // groupBy project
      const rows = await db
        .select({
          group: sql<string>`coalesce(${issues.projectKey}, '(senza progetto)')`,
          name: sql<string>`coalesce(max(${issues.projectName}), '')`,
          seconds: sql<number>`sum(${worklogs.timeSpentSeconds})`,
          entries: sql<number>`count(*)`,
        })
        .from(worklogs)
        .leftJoin(
          issues,
          and(eq(worklogs.userId, issues.userId), eq(worklogs.issueKey, issues.key)),
        )
        .where(and(...baseConds))
        .groupBy(issues.projectKey)
        .orderBy(sql`3 desc`);
      return {
        groupBy: input.groupBy,
        rows: rows.map((r) => ({
          key: r.group,
          label: r.name ? `${r.group} — ${r.name}` : r.group,
          seconds: r.seconds,
          entries: r.entries,
        })),
        totalSeconds: rows.reduce((a, r) => a + r.seconds, 0),
        totalEntries: rows.reduce((a, r) => a + r.entries, 0),
      };
    }),
});
