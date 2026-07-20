import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { approvals } from "@db/schema";
import { weekStartKey } from "@contracts/time";

const weekInput = z.object({
  /** Any date in the target week (ISO string); normalized to its Monday */
  week: z.string().min(1),
});

function normalizeWeek(week: string): string {
  const d = new Date(week);
  if (isNaN(d.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Data settimana non valida" });
  }
  return weekStartKey(d);
}

/**
 * Returns the lock status ("submitted" | "approved") if the week containing
 * `date` is locked for the user, null otherwise.
 */
export async function weekLock(
  userId: number,
  date: Date,
): Promise<"submitted" | "approved" | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.userId, userId), eq(approvals.weekStart, weekStartKey(date))));
  const a = rows[0];
  if (a && (a.status === "submitted" || a.status === "approved")) {
    return a.status as "submitted" | "approved";
  }
  return null;
}

export function assertWeekUnlocked(lock: "submitted" | "approved" | null) {
  if (lock) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        lock === "approved"
          ? "Settimana approvata: le modifiche sono bloccate."
          : "Settimana inviata per approvazione: le modifiche sono bloccate.",
    });
  }
}

export const approvalsRouter = createRouter({
  /** All submissions, most recent first. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(approvals)
      .where(eq(approvals.userId, ctx.user.id))
      .orderBy(desc(approvals.weekStart));
  }),

  /** Approval state of the week containing the given date (null = open). */
  forWeek: protectedProcedure.input(weekInput).query(async ({ ctx, input }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.userId, ctx.user.id),
          eq(approvals.weekStart, normalizeWeek(input.week)),
        ),
      );
    return rows[0] ?? null;
  }),

  /** Submit a week for approval. Re-submitting a rejected week is allowed. */
  submit: protectedProcedure
    .input(weekInput.extend({ note: z.string().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const ws = normalizeWeek(input.week);
      const existing = await db
        .select()
        .from(approvals)
        .where(and(eq(approvals.userId, ctx.user.id), eq(approvals.weekStart, ws)));
      const current = existing[0];
      if (current?.status === "approved") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Settimana già approvata.",
        });
      }
      if (current?.status === "submitted") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Settimana già inviata per approvazione.",
        });
      }
      if (current) {
        // resubmission after rejection
        const saved = await db
          .update(approvals)
          .set({
            status: "submitted",
            note: input.note,
            submittedAt: new Date(),
            decidedAt: null,
          })
          .where(eq(approvals.id, current.id))
          .returning();
        return saved[0];
      }
      const saved = await db
        .insert(approvals)
        .values({
          userId: ctx.user.id,
          weekStart: ws,
          status: "submitted",
          note: input.note,
          submittedAt: new Date(),
        })
        .returning();
      return saved[0];
    }),

  /** Approve a submitted week. */
  approve: protectedProcedure.input(weekInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const ws = normalizeWeek(input.week);
    const existing = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.userId, ctx.user.id), eq(approvals.weekStart, ws)));
    if (existing[0]?.status !== "submitted") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "La settimana non è in attesa di approvazione.",
      });
    }
    const saved = await db
      .update(approvals)
      .set({ status: "approved", decidedAt: new Date() })
      .where(eq(approvals.id, existing[0].id))
      .returning();
    return saved[0];
  }),

  /** Reject a submitted week, unlocking it for edits. */
  reject: protectedProcedure
    .input(weekInput.extend({ note: z.string().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const ws = normalizeWeek(input.week);
      const existing = await db
        .select()
        .from(approvals)
        .where(and(eq(approvals.userId, ctx.user.id), eq(approvals.weekStart, ws)));
      if (existing[0]?.status !== "submitted") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "La settimana non è in attesa di approvazione.",
        });
      }
      const saved = await db
        .update(approvals)
        .set({ status: "rejected", note: input.note, decidedAt: new Date() })
        .where(eq(approvals.id, existing[0].id))
        .returning();
      return saved[0];
    }),
});
