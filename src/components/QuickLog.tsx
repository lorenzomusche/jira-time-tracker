import { useState } from "react";
import { Zap } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { parseDurationToSeconds, formatSeconds } from "@contracts/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const PRESETS = ["15m", "30m", "1h", "2h", "4h", "1d"];

/**
 * Fastest path to log time: pick an issue (native searchable datalist),
 * tap a duration preset, optionally add a comment, done.
 */
export function QuickLog() {
  const utils = trpc.useUtils();
  const issues = trpc.issues.list.useQuery();
  const [issueInput, setIssueInput] = useState("");
  const [timeSpent, setTimeSpent] = useState("");
  const [comment, setComment] = useState("");

  const create = trpc.worklogs.create.useMutation({
    onSuccess: (w) => {
      toast.success(`${formatSeconds(w.timeSpentSeconds)} registrati su ${w.issueKey}`);
      setTimeSpent("");
      setComment("");
      utils.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Accept "PRJ-1", "PRJ-1 — summary" or free text that uniquely matches a key
  const matched = (() => {
    const v = issueInput.trim();
    if (!v) return null;
    const list = issues.data?.issues ?? [];
    const key = v.split(" ")[0].toUpperCase();
    return list.find((i) => i.key.toUpperCase() === key) ?? null;
  })();

  const favorites = (issues.data?.issues ?? []).filter((i) => i.favorite === 1);

  const parsed = parseDurationToSeconds(timeSpent);
  const canSubmit = !!matched && !!parsed && parsed > 0 && !create.isPending;

  const submit = () => {
    if (!canSubmit || !matched || !parsed) return;
    create.mutate({
      issueKey: matched.key,
      timeSpent,
      started: new Date(Date.now() - parsed * 1000).toISOString(),
      comment,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          Consuntivazione rapida
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            list="quicklog-issues"
            placeholder="Issue (digita chiave o titolo)…"
            value={issueInput}
            onChange={(e) => setIssueInput(e.target.value)}
          />
          <datalist id="quicklog-issues">
            {(issues.data?.issues ?? []).map((i) => (
              <option key={i.key} value={`${i.key} — ${i.summary}`} />
            ))}
          </datalist>
          <Input
            className="sm:w-32"
            placeholder="2h 30m"
            value={timeSpent}
            onChange={(e) => setTimeSpent(e.target.value)}
          />
        </div>
        {favorites.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">★</span>
            {favorites.slice(0, 8).map((f) => (
              <Button
                key={f.key}
                type="button"
                variant={matched?.key === f.key ? "default" : "secondary"}
                size="sm"
                className="h-7 px-2 font-mono text-xs"
                onClick={() => setIssueInput(`${f.key} — ${f.summary}`)}
              >
                {f.key}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={timeSpent === p ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setTimeSpent(p)}
            >
              {p}
            </Button>
          ))}
          {matched && (
            <span className="ml-2 truncate text-xs text-muted-foreground">
              → {matched.summary}
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            placeholder="Commento (opzionale)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Button onClick={submit} disabled={!canSubmit}>
            {create.isPending ? "Salvataggio…" : "Registra su Jira"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
