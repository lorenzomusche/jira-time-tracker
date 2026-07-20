import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { timers, type Timer } from "@db/schema";

/** Elapsed seconds for a timer at a given instant. */
export function elapsedSeconds(t: Timer, now: Date = new Date()): number {
  const running =
    t.state === "running"
      ? Math.max(0, Math.floor((now.getTime() - t.startedAt.getTime()) / 1000))
      : 0;
  return t.accumulatedSeconds + running;
}

/** Round up to whole minutes (Jira logs per-minute granularity anyway). */
export function roundUpToMinute(seconds: number): number {
  return Math.max(60, Math.ceil(seconds / 60) * 60);
}

async function pauseTimer(t: Timer, now: Date) {
  const db = getDb();
  const accumulated = elapsedSeconds(t, now);
  await db
    .update(timers)
    .set({ state: "paused", accumulatedSeconds: accumulated, updatedAt: now })
    .where(eq(timers.id, t.id));
}

export const timersRouter = createRouter({
  /** All timers of the user, with elapsed computed at request time. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(timers)
      .where(eq(timers.userId, ctx.user.id));
    const now = new Date();
    return rows.map((t) => ({
      issueKey: t.issueKey,
      state: t.state,
      elapsedSeconds: elapsedSeconds(t, now),
      serverNow: now,
    }));
  }),

  /** Start (or resume) the timer on an issue. Any other running timer is paused. */
  start: protectedProcedure
    .input(z.object({ issueKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const now = new Date();

      // Auto-pause any other running timers (single active timer per user)
      const others = await db
        .select()
        .from(timers)
        .where(
          and(
            eq(timers.userId, ctx.user.id),
            eq(timers.state, "running"),
            ne(timers.issueKey, input.issueKey),
          ),
        );
      for (const o of others) await pauseTimer(o, now);

      const existing = await db
        .select()
        .from(timers)
        .where(
          and(eq(timers.userId, ctx.user.id), eq(timers.issueKey, input.issueKey)),
        )
        .limit(1);

      if (existing[0]) {
        if (existing[0].state !== "running") {
          await db
            .update(timers)
            .set({ state: "running", startedAt: now, updatedAt: now })
            .where(eq(timers.id, existing[0].id));
        }
      } else {
        await db.insert(timers).values({
          userId: ctx.user.id,
          issueKey: input.issueKey,
          state: "running",
          startedAt: now,
          accumulatedSeconds: 0,
        });
      }
      return { ok: true };
    }),

  pause: protectedProcedure
    .input(z.object({ issueKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(timers)
        .where(
          and(eq(timers.userId, ctx.user.id), eq(timers.issueKey, input.issueKey)),
        )
        .limit(1);
      if (rows[0] && rows[0].state === "running") {
        await pauseTimer(rows[0], new Date());
      }
      return { ok: true };
    }),

  /** Stop the timer and return the tracked time (rounded up to minutes). */
  stop: protectedProcedure
    .input(z.object({ issueKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(timers)
        .where(
          and(eq(timers.userId, ctx.user.id), eq(timers.issueKey, input.issueKey)),
        )
        .limit(1);
      const t = rows[0];
      if (!t) return { found: false as const, seconds: 0 };
      const seconds = roundUpToMinute(elapsedSeconds(t, new Date()));
      await db.delete(timers).where(eq(timers.id, t.id));
      return { found: true as const, seconds };
    }),

  /** Discard the timer without logging time. */
  discard: protectedProcedure
    .input(z.object({ issueKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(timers)
        .where(
          and(eq(timers.userId, ctx.user.id), eq(timers.issueKey, input.issueKey)),
        );
      return { ok: true };
    }),
});
