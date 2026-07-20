/** Widgets disponibili nella dashboard personalizzabile. */
export const DASHBOARD_WIDGETS = [
  { id: "quicklog", label: "Registrazione rapida" },
  { id: "stats", label: "Riepilogo ore" },
  { id: "goals", label: "Obiettivi" },
  { id: "deadlines", label: "Scadenze imminenti" },
  { id: "favorites", label: "Issue preferite" },
  { id: "charts", label: "Grafici" },
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];

export interface DashboardLayoutItem {
  id: string;
  visible: boolean;
}

/**
 * Merge a saved layout with the known widgets: keeps saved order and
 * visibility, appends widgets added by newer versions, drops unknown ids.
 */
export function normalizeDashboardLayout(saved: unknown): DashboardLayoutItem[] {
  const known = new Set<string>(DASHBOARD_WIDGETS.map((w) => w.id));
  const items: DashboardLayoutItem[] = [];
  if (Array.isArray(saved)) {
    for (const it of saved) {
      if (
        it &&
        typeof it === "object" &&
        typeof (it as { id?: unknown }).id === "string" &&
        known.has((it as { id: string }).id) &&
        !items.some((x) => x.id === (it as { id: string }).id)
      ) {
        items.push({
          id: (it as { id: string }).id,
          visible: (it as { visible?: unknown }).visible !== false,
        });
      }
    }
  }
  for (const w of DASHBOARD_WIDGETS) {
    if (!items.some((x) => x.id === w.id)) {
      items.push({ id: w.id, visible: true });
    }
  }
  return items;
}
