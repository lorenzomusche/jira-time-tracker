import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";

/**
 * Watches running timers and fires a browser notification when one exceeds
 * the configured threshold (anti "forgotten timer"). Checks every minute.
 */
export function useTimerAlerts() {
  const settings = trpc.settings.get.useQuery(undefined, { staleTime: 60_000 });
  const timers = trpc.timers.list.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const alertedFor = useRef<Set<string>>(new Set());

  useEffect(() => {
    const s = settings.data;
    if (!s || s.notifyEnabled !== 1 || s.timerAlertMinutes <= 0) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const threshold = s.timerAlertMinutes * 60;
    for (const t of timers.data ?? []) {
      if (t.state !== "running") {
        alertedFor.current.delete(t.issueKey);
        continue;
      }
      if (t.elapsedSeconds >= threshold && !alertedFor.current.has(t.issueKey)) {
        alertedFor.current.add(t.issueKey);
        new Notification(`Timer attivo da ${formatSeconds(t.elapsedSeconds)}`, {
          body: `${t.issueKey} è in tracking da oltre ${s.timerAlertMinutes} minuti. Vuoi fermarlo o consuntivare?`,
          tag: `timer-${t.issueKey}`,
        });
      }
    }
  }, [timers.data, settings.data]);
}
