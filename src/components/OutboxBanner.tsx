import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

const KIND_LABEL: Record<string, string> = {
  create: "Creazione",
  update: "Modifica",
  delete: "Eliminazione",
};

/**
 * Slim bar shown under the header when there are worklog operations
 * queued offline. Allows manual replay and per-entry discard.
 */
export function OutboxBanner() {
  const utils = trpc.useUtils();
  const { data } = trpc.outbox.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const retry = trpc.outbox.retry.useMutation({
    onSuccess: (r) => {
      utils.outbox.list.invalidate();
      utils.worklogs.list.invalidate();
      if (r.remaining === 0) {
        toast.success("Tutto sincronizzato con Jira");
      } else if (r.synced > 0) {
        toast.info(`Sincronizzate ${r.synced} operazioni, ${r.remaining} ancora in coda`);
      } else {
        toast.error("Jira ancora irraggiungibile — riprova più tardi");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const discard = trpc.outbox.discard.useMutation({
    onSuccess: () => {
      utils.outbox.list.invalidate();
      utils.worklogs.list.invalidate();
      toast.success("Operazione scartata");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-[13px] md:px-6">
        <CloudOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-amber-900 dark:text-amber-200">
          <strong>{data.length}</strong>{" "}
          {data.length === 1 ? "modifica in attesa" : "modifiche in attesa"} di
          sincronizzazione con Jira
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs text-amber-900 hover:bg-amber-500/15 dark:text-amber-200"
            >
              Dettagli
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96 p-0">
            <div className="border-b px-3 py-2 text-xs font-semibold">
              Coda offline
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {data.map((op) => (
                <li
                  key={op.id}
                  className="flex items-start gap-2 border-b px-3 py-2 text-xs last:border-0"
                >
                  <Badge
                    variant="outline"
                    className="mt-0.5 shrink-0 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300"
                  >
                    {KIND_LABEL[op.kind] ?? op.kind}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono font-medium">{op.issueKey}</div>
                    {op.issueSummary && (
                      <div className="truncate text-muted-foreground">
                        {op.issueSummary}
                      </div>
                    )}
                    <div className="text-muted-foreground">
                      {op.kind !== "delete" && (
                        <span>{formatSeconds(op.timeSpentSeconds)} · </span>
                      )}
                      {op.attempts > 0 && <span>{op.attempts} tentativi · </span>}
                      {op.lastError && (
                        <span className="text-destructive" title={op.lastError}>
                          {op.lastError.slice(0, 60)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Scarta operazione"
                    disabled={discard.isPending}
                    onClick={() => discard.mutate({ id: op.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <Button
          size="sm"
          className="ml-auto h-7 rounded-full px-3 text-xs"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
        >
          <RefreshCw
            className={`mr-1.5 h-3 w-3 ${retry.isPending ? "animate-spin" : ""}`}
          />
          Riprova ora
        </Button>
      </div>
    </div>
  );
}
