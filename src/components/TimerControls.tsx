import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Square, Timer } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { LogTimeDialog } from "@/components/LogTimeDialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** Re-render every second while `active` is true. */
function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [active]);
}

/** Live ticking elapsed time for a timer entry. */
export function TickingElapsed({
  state,
  elapsedSeconds,
  className,
}: {
  state: string;
  elapsedSeconds: number;
  className?: string;
}) {
  const running = state === "running";
  const baseline = useMemo(
    () => ({ elapsed: elapsedSeconds, at: Date.now() }),
    [elapsedSeconds],
  );
  useTick(running);
  const shown = running
    ? baseline.elapsed + (Date.now() - baseline.at) / 1000
    : baseline.elapsed;
  return (
    <span className={`font-mono tabular-nums ${className ?? ""}`}>
      {formatHMS(shown)}
    </span>
  );
}

export function TimerControls({ issueKey }: { issueKey: string }) {
  const utils = trpc.useUtils();
  const list = trpc.timers.list.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const timer = list.data?.find((t) => t.issueKey === issueKey);
  const [logSeconds, setLogSeconds] = useState<number | null>(null);

  const onError = (e: { message: string }) => toast.error(e.message);
  const invalidate = () => utils.timers.list.invalidate();
  const start = trpc.timers.start.useMutation({ onSuccess: invalidate, onError });
  const pause = trpc.timers.pause.useMutation({ onSuccess: invalidate, onError });
  const stop = trpc.timers.stop.useMutation({
    onSuccess: (r) => {
      invalidate();
      if (r.found) setLogSeconds(r.seconds);
    },
    onError,
  });

  const running = timer?.state === "running";
  const paused = timer?.state === "paused";
  const pending = start.isPending || pause.isPending || stop.isPending;

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {timer && (
        <TickingElapsed
          state={timer.state}
          elapsedSeconds={timer.elapsedSeconds}
          className={`mr-1 text-xs ${running ? "text-green-600" : "text-amber-600"}`}
        />
      )}
      {!running ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={paused ? "Riprendi timer" : "Avvia timer"}
          disabled={pending}
          onClick={() => start.mutate({ issueKey })}
        >
          <Play className={`h-4 w-4 ${paused ? "text-amber-600" : "text-green-600"}`} />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Metti in pausa"
          disabled={pending}
          onClick={() => pause.mutate({ issueKey })}
        >
          <Pause className="h-4 w-4 text-amber-600" />
        </Button>
      )}
      {timer && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Stop e consuntiva su Jira"
          disabled={pending}
          onClick={() => stop.mutate({ issueKey })}
        >
          <Square className="h-4 w-4 text-destructive" />
        </Button>
      )}
      {logSeconds !== null && (
        <LogTimeDialog
          issueKey={issueKey}
          prefillSeconds={logSeconds}
          open
          onOpenChange={(o) => {
            if (!o) setLogSeconds(null);
          }}
          trigger={<span />}
        />
      )}
    </div>
  );
}

/** Compact chip shown in the app header for the currently tracked issue. */
export function ActiveTimerChip() {
  const list = trpc.timers.list.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const timer = list.data?.find((t) => t.state === "running") ?? list.data?.[0];
  if (!timer) return null;
  return (
    <a
      href={`/issues/${timer.issueKey}`}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent ${
        timer.state === "running" ? "border-green-600/40 text-green-700" : "border-amber-600/40 text-amber-700"
      }`}
      title={timer.state === "running" ? "Timer attivo" : "Timer in pausa"}
    >
      <Timer className="h-3.5 w-3.5" />
      {timer.issueKey}
      <TickingElapsed state={timer.state} elapsedSeconds={timer.elapsedSeconds} />
    </a>
  );
}
