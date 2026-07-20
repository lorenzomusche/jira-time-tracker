import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  BrushCleaning,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Plus,
  Search,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
import { LogTimeDialog } from "@/components/LogTimeDialog";
import { Button } from "@/components/ui/button";
import { TimerControls } from "@/components/TimerControls";
import { FavoriteStar } from "@/components/FavoriteStar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

function statusVariant(category: string): "default" | "secondary" | "outline" {
  if (category === "Done") return "secondary";
  if (category === "In Progress") return "default";
  return "outline";
}

const PRIORITY_ORDER = ["Highest", "High", "Medium", "Low", "Lowest"];
type SortMode = "recent" | "priority" | "label";

export default function Issues() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [project, setProject] = useState<string>("all");
  const [label, setLabel] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [favOnly, setFavOnly] = useState(false);

  // Global Jira search panel
  const [jiraSearchOpen, setJiraSearchOpen] = useState(false);
  const [jiraQuery, setJiraQuery] = useState("");
  const remoteSearch = trpc.issues.search.useQuery(
    { query: jiraQuery },
    { enabled: jiraSearchOpen && jiraQuery.trim().length >= 2, retry: false },
  );
  const importIssue = trpc.issues.import.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.imported} importata nel catalogo locale`);
      utils.issues.list.invalidate();
      remoteSearch.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const cleanup = trpc.issues.cleanup.useMutation({
    onSuccess: (r) => {
      toast.success(`Pulizia completata: ${r.deleted} issue eliminate, ${r.kept} con storico conservate`);
      utils.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const query = trpc.issues.list.useQuery({
    search: search || undefined,
    status: status === "all" ? undefined : status,
    projectKey: project === "all" ? undefined : project,
    label: label === "all" ? undefined : label,
    favoriteOnly: favOnly || undefined,
  });

  const data = query.data;

  const sorted = useMemo(() => {
    const rows = [...(data?.issues ?? [])];
    if (sort === "priority") {
      rows.sort(
        (a, b) =>
          (PRIORITY_ORDER.indexOf(a.priority) === -1 ? 99 : PRIORITY_ORDER.indexOf(a.priority)) -
          (PRIORITY_ORDER.indexOf(b.priority) === -1 ? 99 : PRIORITY_ORDER.indexOf(b.priority)),
      );
    } else if (sort === "label") {
      rows.sort((a, b) =>
        (a.labels[0] ?? "￿").localeCompare(b.labels[0] ?? "￿"),
      );
    }
    return rows;
  }, [data, sort]);

  const askCleanup = () => {
    if (
      window.confirm(
        "Eliminare dal catalogo locale tutte le issue senza storico di tracking (nessun worklog)? Su Jira non cambia nulla.",
      )
    ) {
      cleanup.mutate();
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Filtra il catalogo locale…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {data?.statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Progetto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i progetti</SelectItem>
            {data?.projects.map((p) => (
              <SelectItem key={p.key} value={p.key}>{p.key} — {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={label} onValueChange={setLabel}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Label" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le label</SelectItem>
            {data?.labels.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Ordina" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Più recenti</SelectItem>
            <SelectItem value="priority">Per priorità</SelectItem>
            <SelectItem value="label">Per label</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={favOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setFavOnly((v) => !v)}
          title="Mostra solo i preferiti"
        >
          ★ Preferiti
        </Button>
        <Button
          variant={jiraSearchOpen ? "default" : "outline"}
          size="sm"
          onClick={() => setJiraSearchOpen((v) => !v)}
        >
          <Globe className="mr-1.5 h-4 w-4" />
          Cerca su Jira
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={askCleanup}
          disabled={cleanup.isPending}
          title="Elimina le issue locali senza worklog"
        >
          <BrushCleaning className="mr-1.5 h-4 w-4" />
          Pulisci
        </Button>
      </div>

      {jiraSearchOpen && (
        <Card>
          <CardContent className="grid gap-3 p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Chiave esatta (PRJ-123) o testo libero — cerca in tutto Jira…"
                value={jiraQuery}
                onChange={(e) => setJiraQuery(e.target.value)}
              />
            </div>
            {remoteSearch.isFetching && <Skeleton className="h-20" />}
            {remoteSearch.error && (
              <p className="text-sm text-destructive">{remoteSearch.error.message}</p>
            )}
            {remoteSearch.data && (
              <div className="grid gap-1.5">
                {remoteSearch.data.length === 0 && (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    Nessun risultato su Jira.
                  </p>
                )}
                {remoteSearch.data.map((r) => (
                  <div
                    key={r.key}
                    className="flex items-center gap-3 rounded-md border p-2.5 text-sm"
                  >
                    <span className="font-mono text-xs font-medium">{r.key}</span>
                    <span className="min-w-0 flex-1 truncate">{r.summary}</span>
                    <Badge variant={statusVariant(r.statusCategory)}>{r.status}</Badge>
                    {!r.isMine && (
                      <Badge variant="outline" className="text-amber-600">
                        {r.assignee ? `di ${r.assignee}` : "non assegnata"}
                      </Badge>
                    )}
                    {r.labels.slice(0, 3).map((l) => (
                      <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>
                    ))}
                    {r.imported ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3.5 w-3.5" /> nel catalogo
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => importIssue.mutate({ key: r.key })}
                        disabled={importIssue.isPending}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Importa
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !data || sorted.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nessuna issue trovata. Premi "Sync Jira" nella barra in alto per
              importare le issue a te assegnate.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Chiave</TableHead>
                  <TableHead>Titolo</TableHead>
                  <TableHead className="w-32">Label</TableHead>
                  <TableHead className="w-28">Stato</TableHead>
                  <TableHead className="w-24">Priorità</TableHead>
                  <TableHead className="w-24 text-right">Registrato</TableHead>
                  <TableHead className="w-36">Timer</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((i) => (
                  <TableRow
                    key={i.key}
                    className="cursor-pointer"
                    onClick={() => navigate(`/issues/${i.key}`)}
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <FavoriteStar
                          issueKey={i.key}
                          favorite={i.favorite === 1}
                          className="-ml-2 h-6 w-6"
                        />
                        {i.key}
                        {!i.isMine && (
                          <span
                            className="h-2 w-2 rounded-full bg-amber-500"
                            title="Non assegnata a te (importata)"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{i.summary}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {i.labels.slice(0, 2).map((l) => (
                          <Badge key={l} variant="secondary" className="text-xs">
                            {l}
                          </Badge>
                        ))}
                        {i.labels.length > 2 && (
                          <span className="text-xs text-muted-foreground">
                            +{i.labels.length - 2}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(i.statusCategory)}>{i.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{i.priority || "—"}</TableCell>
                    <TableCell className="text-right text-xs">
                      {i.timeSpentSeconds ? formatSeconds(i.timeSpentSeconds) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <TimerControls issueKey={i.key} />
                        <LogTimeDialog
                          issueKey={i.key}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Registra tempo"
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <a href={i.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
