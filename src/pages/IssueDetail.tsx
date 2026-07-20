import { useParams, Link } from "react-router";
import { ArrowLeft, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
import { LogTimeDialog } from "@/components/LogTimeDialog";
import { TimerControls } from "@/components/TimerControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function IssueDetail() {
  const { key = "" } = useParams();
  const utils = trpc.useUtils();
  const issue = trpc.issues.get.useQuery({ key });
  const logs = trpc.worklogs.list.useQuery({ issueKey: key });

  const syncLogs = trpc.worklogs.syncIssue.useMutation({
    onSuccess: (r) => {
      toast.success(`Sincronizzati ${r.synced} worklog`);
      utils.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.worklogs.delete.useMutation({
    onSuccess: () => {
      toast.success("Worklog eliminato");
      utils.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (issue.isLoading) return <Skeleton className="h-64" />;
  if (issue.error || !issue.data) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Issue non trovata in locale. Sincronizza prima da Jira.
          </p>
          <Button asChild variant="link" className="px-0">
            <Link to="/issues">← Torna alle issue</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const i = issue.data;
  const total = logs.data?.reduce((acc, w) => acc + w.timeSpentSeconds, 0) ?? 0;
  const pct =
    i.timeEstimateSeconds && i.timeEstimateSeconds > 0
      ? Math.min(100, Math.round(((i.timeSpentSeconds ?? 0) / i.timeEstimateSeconds) * 100))
      : null;

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/issues">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{i.key}</span>
            <Badge variant="outline">{i.issueType}</Badge>
            <Badge>{i.status}</Badge>
            {i.priority && <Badge variant="secondary">{i.priority}</Badge>}
            <a
              href={i.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Apri in Jira <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <h1 className="mt-1 text-xl font-semibold">{i.summary}</h1>
          <p className="text-sm text-muted-foreground">
            {i.projectKey} — {i.projectName}
          </p>
        </div>
        <div className="rounded-md border bg-card px-2 py-1">
          <TimerControls issueKey={key} />
        </div>
      </div>

      {pct !== null && (
        <Card>
          <CardContent className="grid gap-2 p-4">
            <div className="flex justify-between text-sm">
              <span>Progresso tempo</span>
              <span className="text-muted-foreground">
                {formatSeconds(i.timeSpentSeconds ?? 0)} / {formatSeconds(i.timeEstimateSeconds!)} ({pct}%)
              </span>
            </div>
            <Progress value={pct} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Worklog{logs.data ? ` — totale ${formatSeconds(total)}` : ""}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncLogs.mutate({ issueKey: key })}
              disabled={syncLogs.isPending}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${syncLogs.isPending ? "animate-spin" : ""}`} />
              Sync worklog
            </Button>
            <LogTimeDialog
              issueKey={key}
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Registra tempo
                </Button>
              }
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {logs.isLoading ? (
            <Skeleton className="h-24" />
          ) : !logs.data || logs.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nessun worklog registrato. Inizia con "Registra tempo".
            </p>
          ) : (
            logs.data.map((w) => (
              <div
                key={w.id}
                className="flex items-center gap-3 rounded-md border p-3 text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium">{formatSeconds(w.timeSpentSeconds)}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(w.started).toLocaleString("it-IT")}
                  </div>
                  {w.comment && (
                    <div className="mt-1 whitespace-pre-wrap text-xs">{w.comment}</div>
                  )}
                </div>
                <LogTimeDialog
                  issueKey={key}
                  worklog={{
                    jiraWorklogId: w.jiraWorklogId,
                    timeSpentSeconds: w.timeSpentSeconds,
                    started: new Date(w.started),
                    comment: w.comment,
                  }}
                  trigger={
                    <Button variant="ghost" size="icon">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  }
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminare il worklog?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Verrà eliminato sia da Jira sia dall'archivio locale. L'operazione
                        non è reversibile.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          del.mutate({ issueKey: key, jiraWorklogId: w.jiraWorklogId })
                        }
                      >
                        Elimina
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
