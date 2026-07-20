import { useState } from "react";
import { useNavigate } from "react-router";
import { ExternalLink, Search } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
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

function statusVariant(category: string): "default" | "secondary" | "outline" {
  if (category === "Done") return "secondary";
  if (category === "In Progress") return "default";
  return "outline";
}

export default function Issues() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [project, setProject] = useState<string>("all");

  const query = trpc.issues.list.useQuery({
    search: search || undefined,
    status: status === "all" ? undefined : status,
    projectKey: project === "all" ? undefined : project,
  });

  const data = query.data;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cerca per chiave o titolo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {data?.statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Progetto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i progetti</SelectItem>
            {data?.projects.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.key} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !data || data.issues.length === 0 ? (
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
                  <TableHead className="w-32">Progetto</TableHead>
                  <TableHead className="w-28">Stato</TableHead>
                  <TableHead className="w-24">Priorità</TableHead>
                  <TableHead className="w-24 text-right">Stimato</TableHead>
                  <TableHead className="w-24 text-right">Registrato</TableHead>
                  <TableHead className="w-32">Timer</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.issues.map((i) => (
                  <TableRow
                    key={i.key}
                    className="cursor-pointer"
                    onClick={() => navigate(`/issues/${i.key}`)}
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      {i.key}
                    </TableCell>
                    <TableCell className="max-w-md truncate">{i.summary}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {i.projectKey}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(i.statusCategory)}>{i.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{i.priority || "—"}</TableCell>
                    <TableCell className="text-right text-xs">
                      {i.timeEstimateSeconds ? formatSeconds(i.timeEstimateSeconds) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {i.timeSpentSeconds ? formatSeconds(i.timeSpentSeconds) : "—"}
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
