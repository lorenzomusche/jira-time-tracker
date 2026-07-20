import { useMemo, useState } from "react";
import { Link } from "react-router";
import { GripVertical } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const CATEGORY_ORDER = ["To Do", "In Progress", "Done"];

function categoryRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

const COLUMN_COLORS: Record<string, string> = {
  "To Do": "border-t-slate-400",
  "In Progress": "border-t-blue-500",
  Done: "border-t-green-500",
};

export default function Board() {
  const utils = trpc.useUtils();
  const query = trpc.issues.list.useQuery({ pageSize: 200 });
  const [dragOver, setDragOver] = useState<string | null>(null);

  const transition = trpc.issues.transition.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.moved} → ${r.to}`);
      utils.issues.list.invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
      utils.issues.list.invalidate();
    },
  });

  const columns = useMemo(() => {
    const rows = query.data?.issues ?? [];
    const byStatus = new Map<string, { category: string; items: typeof rows }>();
    for (const i of rows) {
      const col = byStatus.get(i.status) ?? { category: i.statusCategory, items: [] };
      col.items.push(i);
      byStatus.set(i.status, col);
    }
    return [...byStatus.entries()]
      .map(([status, v]) => ({ status, ...v }))
      .sort(
        (a, b) =>
          categoryRank(a.category) - categoryRank(b.category) ||
          a.status.localeCompare(b.status),
      );
  }, [query.data]);

  const onDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOver(null);
    const key = e.dataTransfer.getData("text/plain");
    const from = e.dataTransfer.getData("application/x-from-status");
    if (!key || from === status) return;
    transition.mutate({ key, toStatus: status });
  };

  if (query.isLoading) return <Skeleton className="h-96" />;

  if (!query.data || query.data.issues.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Nessuna issue nel catalogo. Premi "Sync Jira" per importare le tue issue.
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div
          key={col.status}
          className={`flex w-72 shrink-0 flex-col rounded-lg border border-t-4 bg-muted/40 ${
            COLUMN_COLORS[col.category] ?? "border-t-gray-400"
          } ${dragOver === col.status ? "ring-2 ring-primary" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(col.status);
          }}
          onDragLeave={() => setDragOver((v) => (v === col.status ? null : v))}
          onDrop={(e) => onDrop(e, col.status)}
        >
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${
                  col.category === "Done"
                    ? "bg-[hsl(var(--success))]"
                    : col.category === "In Progress"
                      ? "bg-[hsl(var(--info))]"
                      : "bg-muted-foreground/50"
                }`}
              />
              {col.status}
            </span>
            <Badge variant="secondary" className="font-mono text-xs">{col.items.length}</Badge>
          </div>
          <div className="grid max-h-[calc(100vh-14rem)] gap-2 overflow-y-auto p-2">
            {col.items.map((i) => (
              <div
                key={i.key}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", i.key);
                  e.dataTransfer.setData("application/x-from-status", i.status);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="cursor-grab rounded-lg border bg-card p-2.5 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5 active:cursor-grabbing"
              >
                <div className="flex items-center gap-1.5">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  <Link
                    to={`/issues/${i.key}`}
                    className="font-mono text-xs font-medium text-primary hover:underline"
                  >
                    {i.key}
                  </Link>
                  {i.priority && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {i.priority}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs">{i.summary}</p>
                {i.labels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {i.labels.slice(0, 3).map((l) => (
                      <Badge key={l} variant="secondary" className="text-[10px]">
                        {l}
                      </Badge>
                    ))}
                    {i.labels.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{i.labels.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
