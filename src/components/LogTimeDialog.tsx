import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { parseDurationToSeconds, formatSeconds } from "@contracts/time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export type EditableWorklog = {
  jiraWorklogId: string;
  timeSpentSeconds: number;
  started: Date;
  comment: string;
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LogTimeDialog({
  issueKey,
  worklog,
  trigger,
  onDone,
  prefillSeconds,
  open: controlledOpen,
  onOpenChange,
}: {
  issueKey: string;
  worklog?: EditableWorklog;
  trigger?: React.ReactNode;
  onDone?: () => void;
  /** Pre-fills the duration (e.g. from a stopped timer). */
  prefillSeconds?: number;
  /** Controlled open state (optional; dialog is uncontrolled otherwise). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => {
    setInternalOpen(o);
    onOpenChange?.(o);
  };
  const [timeSpent, setTimeSpent] = useState("");
  const [started, setStarted] = useState("");
  const [comment, setComment] = useState("");
  const utils = trpc.useUtils();

  useEffect(() => {
    if (open) {
      if (worklog) {
        setTimeSpent(formatSeconds(worklog.timeSpentSeconds));
        setStarted(toLocalInputValue(new Date(worklog.started)));
        setComment(worklog.comment);
      } else {
        setTimeSpent(prefillSeconds ? formatSeconds(prefillSeconds) : "");
        setStarted(toLocalInputValue(new Date()));
        setComment("");
      }
    }
  }, [open, worklog, prefillSeconds]);

  const parsed = parseDurationToSeconds(timeSpent);
  const invalid = timeSpent.trim().length > 0 && (!parsed || parsed <= 0);

  const onSuccess = () => {
    toast.success(worklog ? "Worklog aggiornato su Jira" : "Tempo registrato su Jira");
    setOpen(false);
    utils.invalidate();
    onDone?.();
  };
  const onError = (e: { message: string }) => toast.error(e.message);

  const create = trpc.worklogs.create.useMutation({ onSuccess, onError });
  const update = trpc.worklogs.update.useMutation({ onSuccess, onError });
  const pending = create.isPending || update.isPending;

  const submit = () => {
    if (!parsed || parsed <= 0 || !started) return;
    const payload = {
      issueKey,
      timeSpent,
      started: new Date(started).toISOString(),
      comment,
    };
    if (worklog) {
      update.mutate({ ...payload, jiraWorklogId: worklog.jiraWorklogId });
    } else {
      create.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {worklog ? "Modifica worklog" : "Registra tempo"} — {issueKey}
          </DialogTitle>
          <DialogDescription>
            Il worklog viene salvato direttamente su Jira e archiviato in locale.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="lt-time">Tempo impiegato</Label>
            <Input
              id="lt-time"
              placeholder='es. "2h 30m", "1d", "45m"'
              value={timeSpent}
              onChange={(e) => setTimeSpent(e.target.value)}
            />
            {invalid && (
              <p className="text-xs text-destructive">
                Formato non valido. Usa unità w (settimane), d (giorni), h (ore), m (minuti).
              </p>
            )}
            {parsed && parsed > 0 && (
              <p className="text-xs text-muted-foreground">= {formatSeconds(parsed)}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lt-started">Data e ora di inizio</Label>
            <Input
              id="lt-started"
              type="datetime-local"
              value={started}
              onChange={(e) => setStarted(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lt-comment">Commento</Label>
            <Textarea
              id="lt-comment"
              placeholder="Cosa hai fatto?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={pending || !parsed || parsed <= 0 || !started}>
            {pending ? "Salvataggio..." : worklog ? "Aggiorna" : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
