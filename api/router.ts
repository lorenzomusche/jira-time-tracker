import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { issuesRouter } from "./routers/issues";
import { worklogsRouter } from "./routers/worklogs";
import { statsRouter } from "./routers/stats";
import { timersRouter } from "./routers/timers";
import { settingsRouter } from "./routers/settings";
import { reportsRouter } from "./routers/reports";
import { outboxRouter } from "./routers/outbox";
import { approvalsRouter } from "./routers/approvals";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  issues: issuesRouter,
  worklogs: worklogsRouter,
  stats: statsRouter,
  timers: timersRouter,
  settings: settingsRouter,
  reports: reportsRouter,
  outbox: outboxRouter,
  approvals: approvalsRouter,
});

export type AppRouter = typeof appRouter;
