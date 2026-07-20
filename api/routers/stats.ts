import { and, eq, gte, lt, sql } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { issues, worklogs } from "@db/schema";

export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const statsRouter = createRouter({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const now = new Date();
    const weekStart = startOfWeek(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = startOfDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const sumWhere = async (from: Date, to?: Date) => {
      const conds = [eq(worklogs.userId, ctx.user.id), gte(worklogs.started, from)];
      if (to) conds.push(lt(worklogs.started, to));
      const rows = await db
        .select({ total: sql<number>`coalesce(sum(${worklogs.timeSpentSeconds}), 0)` })
        .from(worklogs)
        .where(and(...conds));
      return rows[0]?.total ?? 0;
    };

    const [todaySec, weekSec, monthSec] = await Promise.all([
      sumWhere(todayStart, tomorrowStart),
      sumWhere(weekStart),
      sumWhere(monthStart),
    ]);

    // Hours per day over the last 14 days
    const rangeStart = startOfDay(now);
    rangeStart.setDate(rangeStart.getDate() - 13);
    const perDayRows = await db
      .select({
        day: sql<string>`date(${worklogs.started} / 1000, 'unixepoch', 'localtime')`,
        total: sql<number>`sum(${worklogs.timeSpentSeconds})`,
      })
      .from(worklogs)
      .where(and(eq(worklogs.userId, ctx.user.id), gte(worklogs.started, rangeStart)))
      .groupBy(sql`date(${worklogs.started} / 1000, 'unixepoch', 'localtime')`);

    const perDay: { date: string; seconds: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hit = perDayRows.find((r) => r.day === key);
      perDay.push({ date: key, seconds: hit?.total ?? 0 });
    }

    // Hours per project (this month)
    const perProject = await db
      .select({
        projectKey: issues.projectKey,
        projectName: issues.projectName,
        total: sql<number>`sum(${worklogs.timeSpentSeconds})`,
      })
      .from(worklogs)
      .innerJoin(
        issues,
        and(eq(worklogs.userId, issues.userId), eq(worklogs.issueKey, issues.key)),
      )
      .where(and(eq(worklogs.userId, ctx.user.id), gte(worklogs.started, monthStart)))
      .groupBy(issues.projectKey, issues.projectName)
      .orderBy(sql`sum(${worklogs.timeSpentSeconds}) desc`)
      .limit(8);

    // Issue counts by status category
    const byCategory = await db
      .select({
        category: issues.statusCategory,
        count: sql<number>`count(*)`,
      })
      .from(issues)
      .where(eq(issues.userId, ctx.user.id))
      .groupBy(issues.statusCategory);

    const totalIssues = byCategory.reduce((acc, r) => acc + r.count, 0);

    return {
      todaySeconds: todaySec,
      weekSeconds: weekSec,
      monthSeconds: monthSec,
      perDay,
      perProject: perProject.map((p) => ({
        projectKey: p.projectKey,
        projectName: p.projectName,
        seconds: p.total,
      })),
      issueCount: totalIssues,
      openIssueCount: byCategory
        .filter((c) => c.category !== "Done")
        .reduce((acc, r) => acc + r.count, 0),
    };
  }),
});
