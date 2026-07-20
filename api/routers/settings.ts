import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { settings, type Settings } from "@db/schema";
import {
  normalizeDashboardLayout,
  type DashboardLayoutItem,
} from "@contracts/dashboard";

const DEFAULTS = {
  dailyTargetSeconds: 8 * 3600,
  weeklyTargetSeconds: 40 * 3600,
  timerAlertMinutes: 120,
  notifyEnabled: 1,
};

export async function getSettings(userId: number): Promise<Settings> {
  const db = getDb();
  const rows = await db.select().from(settings).where(eq(settings.userId, userId));
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(settings)
    .values({ userId, ...DEFAULTS })
    .returning();
  return inserted[0];
}

export type SettingsWithDashboard = Settings & { dashboard: DashboardLayoutItem[] };

function withDashboard(row: Settings): SettingsWithDashboard {
  let saved: unknown = null;
  if (row.dashboardLayout) {
    try {
      saved = JSON.parse(row.dashboardLayout);
    } catch {
      saved = null;
    }
  }
  return { ...row, dashboard: normalizeDashboardLayout(saved) };
}

export const settingsRouter = createRouter({
  get: protectedProcedure.query(async ({ ctx }) =>
    withDashboard(await getSettings(ctx.user.id)),
  ),

  update: protectedProcedure
    .input(
      z.object({
        dailyTargetSeconds: z.number().int().min(1800).max(16 * 3600).optional(),
        weeklyTargetSeconds: z.number().int().min(3600).max(80 * 3600).optional(),
        timerAlertMinutes: z.number().int().min(0).max(720).optional(),
        notifyEnabled: z.number().int().min(0).max(1).optional(),
        dashboardLayout: z
          .array(z.object({ id: z.string().min(1), visible: z.boolean() }))
          .max(20)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await getSettings(ctx.user.id); // ensure row exists
      const { dashboardLayout, ...rest } = input;
      await db
        .update(settings)
        .set({
          ...rest,
          ...(dashboardLayout
            ? { dashboardLayout: JSON.stringify(dashboardLayout) }
            : {}),
        })
        .where(eq(settings.userId, ctx.user.id));
      return withDashboard(await getSettings(ctx.user.id));
    }),
});
