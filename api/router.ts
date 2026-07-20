import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { issuesRouter } from "./routers/issues";
import { worklogsRouter } from "./routers/worklogs";
import { statsRouter } from "./routers/stats";
import { timersRouter } from "./routers/timers";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  issues: issuesRouter,
  worklogs: worklogsRouter,
  stats: statsRouter,
  timers: timersRouter,
});

export type AppRouter = typeof appRouter;
