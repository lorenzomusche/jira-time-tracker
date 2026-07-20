import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, CopyPlus, Download } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { GoalRing } from "@/components/GoalRing";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];


export default function Timesheet() {
  const [weekOffset, setWeekOffset] = useState(0);
  const settings = trpc.settings.get.useQuery();
  const dailyTarget = settings.data?.dailyTargetSeconds ?? 8 * 3600;
  const [selected, setSelected] = useState<Set<number>>(new Set());

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

  const del = trpc.worklogs.delete.useMutation();
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const deleteSelected = async () => {
    const entries = (logs.data ?? []).filter((w) => selected.has(w.id));
    if (entries.length === 0) return;
    if (!window.confirm(`Eliminare ${entries.length} worklog selezionati (anche da Jira)?`)) return;
    let ok = 0;
    for (const w of entries) {
      try {
        await del.mutateAsync({ issueKey: w.issueKey, jiraWorklogId: w.jiraWorklogId });
        ok++;
      } catch { /* continue */ }
    }
    toast.success(`${ok}/${entries.length} worklog eliminati`);
    setSelected(new Set());
    utils.invalidate();
  };

  /** Export the visible week's worklogs as CSV (native Blob download). */
  const exportCsv = () => {
    const rows = (logs.data ?? []).map((w) => ({
      data: new Date(w.started).toLocaleDateString("it-IT"),
      issue: w.issueKey,
      secondi: w.timeSpentSeconds,
      ore: (w.timeSpentSeconds / 3600).toFixed(2),
      commento: w.comment.replace(/"/g, '""'),
    }));
    const header = "data;issue;secondi;ore;commento";
    const body = rows.map((r) => `${r.data};${r.issue};${r.secondi};${r.ore};"${r.commento}"`);
    const csv = "\ufeff" + [header, ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${weekStart.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Esportati ${rows.length} worklog`);
  };
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
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={deleteSelected} disabled={del.isPending}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Elimina {selected.size}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!logs.data || logs.data.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Esporta CSV
          </Button>
          {settings.data ? (
            <GoalRing
              current={weekTotal}
              target={settings.data.weeklyTargetSeconds}
              size={44}
              stroke={5}
            />
          ) : (
            <div className="text-sm font-semibold">Totale: {formatSeconds(weekTotal)}</div>
          )}
        </div>
      </div>

      {logs.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {days.map((d, i) => {
            const pct = Math.min(100, Math.round((d.total / dailyTarget) * 100));
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
                      <span className={d.total >= dailyTarget ? "text-[hsl(var(--success))]" : ""}>
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
                      <div key={w.id} className="flex items-start gap-1.5">
                        <Checkbox
                          className="mt-2"
                          checked={selected.has(w.id)}
                          onCheckedChange={() => toggleSelect(w.id)}
                        />
                        <Link
                          to={`/issues/${w.issueKey}`}
                          className="flex-1 rounded-md border p-2 text-xs transition-colors hover:bg-accent"
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
                      </div>
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
