import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, CopyPlus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DAILY_TARGET = 8 * 3600;

export default function Timesheet() {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);

  const logs = trpc.worklogs.list.useQuery({
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
  });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const entries = (logs.data ?? []).filter((w) => {
        const s = new Date(w.started);
        const k = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
        return k === key;
      });
      const total = entries.reduce((acc, w) => acc + w.timeSpentSeconds, 0);
      return { date, key, entries, total };
    });
  }, [weekStart, logs.data]);

  const weekTotal = days.reduce((acc, d) => acc + d.total, 0);
  const isCurrentWeek = weekOffset === 0;

  const utils = trpc.useUtils();
  const [duplicating, setDuplicating] = useState(false);
  const create = trpc.worklogs.create.useMutation();

  /** Duplicate all worklogs of a day onto today (same issues, durations, comments). */
  const duplicateDay = async (
    entries: { issueKey: string; timeSpentSeconds: number; comment: string }[],
    fromLabel: string,
  ) => {
    if (entries.length === 0 || duplicating) return;
    const total = entries.reduce((a, w) => a + w.timeSpentSeconds, 0);
    if (
      !window.confirm(
        `Duplicare ${entries.length} worklog (${formatSeconds(total)}) da ${fromLabel} a oggi?`,
      )
    ) {
      return;
    }
    setDuplicating(true);
    let ok = 0;
    try {
      let cursor = Date.now();
      for (const w of entries) {
        await create.mutateAsync({
          issueKey: w.issueKey,
          timeSpent: formatSeconds(w.timeSpentSeconds),
          started: new Date(cursor - w.timeSpentSeconds * 1000).toISOString(),
          comment: w.comment,
        });
        cursor -= w.timeSpentSeconds * 1000; // back-to-back entries ending now
        ok++;
      }
      toast.success(`${ok} worklog duplicati su oggi`);
      utils.invalidate();
    } catch (e) {
      toast.error(
        `Duplicati ${ok}/${entries.length}: ${e instanceof Error ? e.message : "errore"}`,
      );
      utils.invalidate();
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(0)}
            disabled={isCurrentWeek}
          >
            Oggi
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={weekOffset >= 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-sm font-medium text-muted-foreground">
          Settimana del {weekStart.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
        </h2>
        <div className="text-sm font-semibold">
          Totale: {formatSeconds(weekTotal)}
        </div>
      </div>

      {logs.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {days.map((d, i) => {
            const pct = Math.min(100, Math.round((d.total / DAILY_TARGET) * 100));
            const isToday = d.key === new Date().toISOString().slice(0, 10) ||
              d.date.toDateString() === new Date().toDateString();
            return (
              <Card key={d.key} className={isToday ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>
                      {DAY_NAMES[i]}{" "}
                      <span className="text-muted-foreground">
                        {d.date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      {!isToday && d.entries.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Duplica questa giornata su oggi"
                          disabled={duplicating}
                          onClick={() =>
                            duplicateDay(
                              d.entries,
                              d.date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
                            )
                          }
                        >
                          <CopyPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <span className={d.total >= DAILY_TARGET ? "text-green-600" : ""}>
                        {formatSeconds(d.total)}
                      </span>
                    </span>
                  </CardTitle>
                  <Progress value={pct} className="h-1.5" />
                </CardHeader>
                <CardContent className="grid gap-2">
                  {d.entries.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      Nessuna registrazione
                    </p>
                  ) : (
                    d.entries.map((w) => (
                      <Link
                        key={w.id}
                        to={`/issues/${w.issueKey}`}
                        className="rounded-md border p-2 text-xs transition-colors hover:bg-accent"
                      >
                        <div className="flex justify-between font-medium">
                          <span className="font-mono">{w.issueKey}</span>
                          <span>{formatSeconds(w.timeSpentSeconds)}</span>
                        </div>
                        {w.comment && (
                          <div className="mt-0.5 line-clamp-2 text-muted-foreground">
                            {w.comment}
                          </div>
                        )}
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
