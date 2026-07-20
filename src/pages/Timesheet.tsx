import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, CopyPlus, Download, Lock, Send, ShieldCheck, ShieldX } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


export default function Timesheet() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"week" | "month">("week");
  const [monthOffset, setMonthOffset] = useState(0);
  const settings = trpc.settings.get.useQuery();
  const dailyTarget = settings.data?.dailyTargetSeconds ?? 8 * 3600;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const switchView = (v: "week" | "month") => {
    setView(v);
    setSelected(new Set());
  };

  const monthCursor = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const gridStart = useMemo(() => startOfWeek(monthCursor), [monthCursor]);
  const gridEnd = useMemo(() => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + 42);
    return d;
  }, [gridStart]);

  const navPrev = () =>
    view === "week" ? setWeekOffset((w) => w - 1) : setMonthOffset((m) => m - 1);
  const navNext = () =>
    view === "week" ? setWeekOffset((w) => w + 1) : setMonthOffset((m) => m + 1);
  const navToday = () => {
    setWeekOffset(0);
    setMonthOffset(0);
  };

  /** Jump from a month-grid day to the week containing it. */
  const jumpToWeek = (date: Date) => {
    const diff = startOfWeek(date).getTime() - startOfWeek(new Date()).getTime();
    setWeekOffset(Math.round(diff / (7 * 86400000)));
    setView("week");
  };

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
    from: (view === "week" ? weekStart : gridStart).toISOString(),
    to: (view === "week" ? weekEnd : gridEnd).toISOString(),
  });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const key = dayKey(date);
      const entries = (logs.data ?? []).filter((w) => dayKey(new Date(w.started)) === key);
      const total = entries.reduce((acc, w) => acc + w.timeSpentSeconds, 0);
      return { date, key, entries, total };
    });
  }, [weekStart, logs.data]);

  const weekTotal = days.reduce((acc, d) => acc + d.total, 0);

  /** 42 celle (6 settimane) per la griglia mensile. */
  const monthCells = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart);
      date.setDate(date.getDate() + i);
      const key = dayKey(date);
      const entries = (logs.data ?? []).filter((w) => dayKey(new Date(w.started)) === key);
      const total = entries.reduce((acc, w) => acc + w.timeSpentSeconds, 0);
      return { date, key, entries, total, inMonth: date.getMonth() === monthCursor.getMonth() };
    });
  }, [gridStart, monthCursor, logs.data]);

  const monthTotal = monthCells
    .filter((c) => c.inMonth)
    .reduce((acc, c) => acc + c.total, 0);

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
    a.download = view === "week"
      ? `timesheet-${weekStart.toISOString().slice(0, 10)}.csv`
      : `timesheet-${monthCursor.toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Esportati ${rows.length} worklog`);
  };
  const isCurrentWeek = weekOffset === 0;

  const utils = trpc.useUtils();
  const [duplicating, setDuplicating] = useState(false);
  const create = trpc.worklogs.create.useMutation();

  // --- weekly approval workflow ---
  const approval = trpc.approvals.forWeek.useQuery({ week: weekStart.toISOString() });
  const weekLocked =
    approval.data?.status === "submitted" || approval.data?.status === "approved";
  const invalidateApproval = () => {
    utils.approvals.forWeek.invalidate();
    utils.approvals.list.invalidate();
  };
  const submitMut = trpc.approvals.submit.useMutation({
    onSuccess: () => {
      invalidateApproval();
      toast.success("Settimana inviata per approvazione: modifiche bloccate");
    },
    onError: (e) => toast.error(e.message),
  });
  const approveMut = trpc.approvals.approve.useMutation({
    onSuccess: () => {
      invalidateApproval();
      toast.success("Settimana approvata");
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.approvals.reject.useMutation({
    onSuccess: () => {
      invalidateApproval();
      toast.success("Settimana rifiutata: modifiche sbloccate");
    },
    onError: (e) => toast.error(e.message),
  });
  const onSubmitWeek = () => submitMut.mutate({ week: weekStart.toISOString() });
  const onRejectWeek = () => {
    const note = window.prompt("Motivo del rifiuto (opzionale):") ?? "";
    rejectMut.mutate({ week: weekStart.toISOString(), note });
  };

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
          <Button variant="outline" size="icon" onClick={navPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={navToday}
            disabled={view === "week" ? isCurrentWeek : monthOffset === 0}
          >
            Oggi
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={navNext}
            disabled={view === "week" ? weekOffset >= 0 : monthOffset >= 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium capitalize text-muted-foreground">
            {view === "week"
              ? `Settimana del ${weekStart.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`
              : monthCursor.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
          </h2>
          <div className="flex rounded-full border p-0.5" role="tablist" aria-label="Vista">
            <button
              role="tab"
              aria-selected={view === "week"}
              onClick={() => switchView("week")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                view === "week"
                  ? "gradient-brand text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Settimana
            </button>
            <button
              role="tab"
              aria-selected={view === "month"}
              onClick={() => switchView("month")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                view === "month"
                  ? "gradient-brand text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Mese
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {view === "week" && (
            <div className="flex items-center gap-2">
              {approval.data?.status === "approved" ? (
                <span className="flex items-center gap-1 rounded-full bg-[hsl(var(--success)/0.15)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--success))]">
                  <Lock className="h-3 w-3" /> Approvata
                </span>
              ) : approval.data?.status === "submitted" ? (
                <>
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <Lock className="h-3 w-3" /> In attesa
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full text-xs"
                    onClick={() => approveMut.mutate({ week: weekStart.toISOString() })}
                    disabled={approveMut.isPending}
                  >
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Approva
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full text-xs text-destructive"
                    onClick={onRejectWeek}
                    disabled={rejectMut.isPending}
                  >
                    <ShieldX className="mr-1 h-3.5 w-3.5" /> Rifiuta
                  </Button>
                </>
              ) : approval.data?.status === "rejected" ? (
                <>
                  <span
                    className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                    title={approval.data.note || undefined}
                  >
                    Rifiutata{approval.data.note ? `: ${approval.data.note}` : ""}
                  </span>
                  <Button
                    size="sm"
                    className="h-7 rounded-full text-xs"
                    onClick={onSubmitWeek}
                    disabled={submitMut.isPending}
                  >
                    <Send className="mr-1 h-3.5 w-3.5" /> Invia di nuovo
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full text-xs"
                  onClick={onSubmitWeek}
                  disabled={submitMut.isPending}
                >
                  <Send className="mr-1 h-3.5 w-3.5" /> Invia per approvazione
                </Button>
              )}
            </div>
          )}
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={deleteSelected} disabled={del.isPending || weekLocked}>
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
          {view === "month" ? (
            <div className="text-sm font-semibold">
              Mese: {formatSeconds(monthTotal)}
            </div>
          ) : settings.data ? (
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
      ) : view === "month" ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-7 gap-2">
            {DAY_NAMES.map((n) => (
              <div
                key={n}
                className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {n}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthCells.map((c) => {
              const pct = Math.min(100, Math.round((c.total / dailyTarget) * 100));
              const isToday = c.date.toDateString() === new Date().toDateString();
              const hasPending = c.entries.some((w) =>
                w.jiraWorklogId.startsWith("pending-"),
              );
              return (
                <button
                  key={c.key}
                  onClick={() => jumpToWeek(c.date)}
                  title={`Apri la settimana del ${c.date.toLocaleDateString("it-IT")}`}
                  className={cn(
                    "flex min-h-24 flex-col rounded-lg border bg-card p-2 text-left transition-all hover:border-primary/40 hover:shadow-sm",
                    !c.inMonth && "opacity-40",
                    isToday && "border-primary ring-1 ring-primary/30",
                  )}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-medium", isToday && "text-primary")}>
                      {c.date.getDate()}
                    </span>
                    {hasPending && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                        title="Modifiche in coda di sincronizzazione"
                      />
                    )}
                  </div>
                  {c.total > 0 ? (
                    <>
                      <span
                        className={cn(
                          "mt-1 text-sm font-semibold",
                          c.total >= dailyTarget && "text-[hsl(var(--success))]",
                        )}
                      >
                        {formatSeconds(c.total)}
                      </span>
                      <Progress value={pct} className="mt-1 h-1" />
                      <span className="mt-1 text-[10px] text-muted-foreground">
                        {c.entries.length}{" "}
                        {c.entries.length === 1 ? "registrazione" : "registrazioni"}
                      </span>
                    </>
                  ) : (
                    <span className="mt-auto text-[10px] text-muted-foreground/50">—</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
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
                      {!isToday && d.entries.length > 0 && !weekLocked && (
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
                        {!weekLocked && (
                          <Checkbox
                            className="mt-2"
                            checked={selected.has(w.id)}
                            onCheckedChange={() => toggleSelect(w.id)}
                          />
                        )}
                        <Link
                          to={`/issues/${w.issueKey}`}
                          className="flex-1 rounded-md border p-2 text-xs transition-colors hover:bg-accent"
                        >
                        <div className="flex justify-between font-medium">
                          <span className="font-mono">{w.issueKey}</span>
                          <span className="flex items-center gap-1.5">
                            {w.jiraWorklogId.startsWith("pending-") && (
                              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                in coda
                              </span>
                            )}
                            {formatSeconds(w.timeSpentSeconds)}
                          </span>
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
