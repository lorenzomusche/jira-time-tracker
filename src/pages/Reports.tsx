import { useMemo, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds, formatHours } from "@contracts/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type GroupBy = "day" | "issue" | "project";

export default function Reports() {
  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );
  const [from, setFrom] = useState(isoDay(monthStart));
  const [to, setTo] = useState(isoDay(today));
  const [groupBy, setGroupBy] = useState<GroupBy>("day");

  // to is inclusive end-of-day
  const toExclusive = useMemo(() => {
    const d = new Date(to);
    d.setDate(d.getDate() + 1);
    return d;
  }, [to]);

  const report = trpc.reports.generate.useQuery({
    from: new Date(from).toISOString(),
    to: toExclusive.toISOString(),
    groupBy,
  });

  const exportCsv = () => {
    const r = report.data;
    if (!r) return;
    const header = "gruppo;secondi;ore;registrazioni";
    const body = r.rows.map(
      (x) => `"${x.label.replace(/"/g, '""')}";${x.seconds};${(x.seconds / 3600).toFixed(2)};${x.entries}`,
    );
    const total = `"TOTALE";${r.totalSeconds};${(r.totalSeconds / 3600).toFixed(2)};${r.totalEntries}`;
    const csv = "﻿" + [header, ...body, total].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${groupBy}-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report esportato");
  };

  const maxSeconds = Math.max(1, ...(report.data?.rows.map((r) => r.seconds) ?? [1]));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Report consuntivazione
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="from">Da</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to">A</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Raggruppa per</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Giorno</SelectItem>
                <SelectItem value="issue">Issue</SelectItem>
                <SelectItem value="project">Progetto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!report.data || report.data.rows.length === 0}
            className="ml-auto"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Esporta CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {report.isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : !report.data || report.data.rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nessun worklog nel periodo selezionato.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {groupBy === "day" ? "Giorno" : groupBy === "issue" ? "Issue" : "Progetto"}
                  </TableHead>
                  <TableHead className="w-1/3" />
                  <TableHead className="w-28 text-right">Ore</TableHead>
                  <TableHead className="w-28 text-right">Registrazioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="max-w-md truncate font-medium">
                      {groupBy === "day"
                        ? new Date(r.key + "T12:00:00").toLocaleDateString("it-IT", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })
                        : r.label}
                    </TableCell>
                    <TableCell>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="gradient-brand h-full rounded-full transition-all"
                          style={{ width: `${(r.seconds / maxSeconds) * 100}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatSeconds(r.seconds)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({formatHours(r.seconds)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.entries}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Totale</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono">
                    {formatSeconds(report.data.totalSeconds)}
                  </TableCell>
                  <TableCell className="text-right">{report.data.totalEntries}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
