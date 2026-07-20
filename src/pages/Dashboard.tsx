import { useRef, useState } from "react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  ListTodo,
  Settings2,
  Star,
  TriangleAlert,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
import {
  DASHBOARD_WIDGETS,
  normalizeDashboardLayout,
  type DashboardLayoutItem,
} from "@contracts/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickLog } from "@/components/QuickLog";
import { GoalRing } from "@/components/GoalRing";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

const COLORS = [
  "hsl(var(--primary))",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
];

const WIDGET_LABEL: Map<string, string> = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.label]));

export default function Dashboard() {
  const stats = trpc.stats.dashboard.useQuery();
  const settings = trpc.settings.get.useQuery();
  const issues = trpc.issues.list.useQuery({ pageSize: 200 });
  const utils = trpc.useUtils();

  const [editing, setEditing] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });

  const layout: DashboardLayoutItem[] =
    settings.data?.dashboard ?? normalizeDashboardLayout(null);
  const saveLayout = (next: DashboardLayoutItem[]) =>
    updateSettings.mutate({ dashboardLayout: next });

  const moveWidget = (from: number, to: number) => {
    if (from === to) return;
    const next = [...layout];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    saveLayout(next);
  };

  const toggleWidget = (id: string) =>
    saveLayout(layout.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));

  if (stats.isLoading) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (stats.error || !stats.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Nessun dato ancora. Vai su{" "}
          <Link to="/issues" className="text-primary underline">
            Issue
          </Link>{" "}
          e premi "Sync Jira" per importare le tue issue.
        </CardContent>
      </Card>
    );
  }

  const s = stats.data;
  const dayData = s.perDay.map((d) => ({
    day: d.date.slice(5).split("-").reverse().join("/"),
    ore: +(d.seconds / 3600).toFixed(2),
  }));
  const projectData = s.perProject.map((p) => ({
    name: p.projectKey || p.projectName,
    ore: +(p.seconds / 3600).toFixed(2),
  }));

  const cards = [
    {
      title: "Oggi",
      value: formatSeconds(s.todaySeconds),
      icon: CalendarClock,
      chip: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
    },
    {
      title: "Questa settimana",
      value: formatSeconds(s.weekSeconds),
      icon: CalendarDays,
      chip: "bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]",
    },
    {
      title: "Questo mese",
      value: formatSeconds(s.monthSeconds),
      icon: CalendarRange,
      chip: "bg-primary/10 text-primary",
    },
    {
      title: "Issue aperte",
      value: String(s.openIssueCount),
      icon: ListTodo,
      chip: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
    },
  ];

  // --- widget data derivations ---
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const in14 = new Date(now);
  in14.setDate(in14.getDate() + 14);
  const upcoming = (issues.data?.issues ?? [])
    .filter((i) => {
      if (!i.dueDate || i.statusCategory.toLowerCase() === "done") return false;
      const d = new Date(`${i.dueDate}T00:00:00`);
      return d <= in14;
    })
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 5);
  const favorites = (issues.data?.issues ?? []).filter((i) => i.favorite === 1).slice(0, 6);

  const renderWidget = (id: string) => {
    switch (id) {
      case "quicklog":
        return <QuickLog />;
      case "stats":
        return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(({ title, value, icon: Icon, chip }) => (
              <Card key={title} className="card-hover">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className={`stat-icon ${chip}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">{title}</div>
                    <div className="font-display text-xl font-semibold tracking-tight">
                      {value}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      case "goals":
        return settings.data ? (
          <Card>
            <CardContent className="flex flex-wrap gap-8 p-4">
              <GoalRing
                current={s.todaySeconds}
                target={settings.data.dailyTargetSeconds}
                label="Obiettivo di oggi"
              />
              <GoalRing
                current={s.weekSeconds}
                target={settings.data.weeklyTargetSeconds}
                label="Obiettivo settimanale"
              />
            </CardContent>
          </Card>
        ) : null;
      case "deadlines":
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <TriangleAlert className="h-4 w-4 text-[hsl(var(--warning))]" />
                Scadenze imminenti
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5">
              {upcoming.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Nessuna scadenza nei prossimi 14 giorni.
                </p>
              ) : (
                upcoming.map((i) => {
                  const due = new Date(`${i.dueDate}T00:00:00`);
                  const days = Math.round((due.getTime() - now.getTime()) / 86400000);
                  return (
                    <Link
                      key={i.key}
                      to={`/issues/${i.key}`}
                      className="flex items-center gap-3 rounded-md border p-2 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="font-mono text-xs font-medium">{i.key}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {i.summary}
                      </span>
                      <StatusBadge status={i.status} category={i.statusCategory} className="text-[10px]" />
                      <span
                        className={cn(
                          "shrink-0 text-xs font-semibold",
                          days < 0
                            ? "text-destructive"
                            : days <= 2
                              ? "text-[hsl(var(--warning))]"
                              : "text-muted-foreground",
                        )}
                      >
                        {days < 0
                          ? `scaduta da ${-days}g`
                          : days === 0
                            ? "scade oggi"
                            : `tra ${days}g`}
                      </span>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      case "favorites":
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Star className="h-4 w-4 fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" />
                Issue preferite
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5">
              {favorites.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Nessuna preferita: usa la stella nella pagina{" "}
                  <Link to="/issues" className="text-primary underline">
                    Issue
                  </Link>
                  .
                </p>
              ) : (
                favorites.map((i) => (
                  <Link
                    key={i.key}
                    to={`/issues/${i.key}`}
                    className="flex items-center gap-3 rounded-md border p-2 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="font-mono text-xs font-medium">{i.key}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {i.summary}
                    </span>
                    <StatusBadge status={i.status} category={i.statusCategory} className="text-[10px]" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        );
      case "charts":
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-display text-base">
                  Ore registrate — ultimi 14 giorni
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis fontSize={12} unit="h" />
                    <Tooltip formatter={(v) => [`${v}h`, "Ore"]} />
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(262 83% 58%)" />
                        <stop offset="100%" stopColor="hsl(292 75% 55%)" />
                      </linearGradient>
                    </defs>
                    <Bar dataKey="ore" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">
                  Ore per progetto — questo mese
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {projectData.length === 0 ? (
                  <p className="pt-16 text-center text-sm text-muted-foreground">
                    Nessun worklog questo mese.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={projectData}
                        dataKey="ore"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        label={({ name, ore }) => `${name}: ${ore}h`}
                        fontSize={11}
                      >
                        {projectData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v}h`, "Ore"]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        );
      default:
        return null;
    }
  };

  const visibleCount = layout.filter((l) => l.visible).length;

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <Button
          variant={editing ? "default" : "outline"}
          size="sm"
          className="rounded-full"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Fatto
            </>
          ) : (
            <>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Personalizza
            </>
          )}
        </Button>
      </div>

      {!editing && visibleCount === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Tutti i widget sono nascosti. Premi "Personalizza" per riattivarli.
          </CardContent>
        </Card>
      )}

      {layout.map((item, idx) => {
        if (!editing && !item.visible) return null;
        return (
          <section
            key={item.id}
            draggable={editing}
            onDragStart={() => {
              dragIndex.current = idx;
            }}
            onDragOver={(e) => {
              if (editing) e.preventDefault();
            }}
            onDrop={() => {
              if (dragIndex.current !== null) moveWidget(dragIndex.current, idx);
              dragIndex.current = null;
            }}
            onDragEnd={() => {
              dragIndex.current = null;
            }}
            className={cn(
              editing &&
                "rounded-xl p-2 outline-dashed outline-2 outline-primary/25 transition-colors hover:outline-primary/50",
              editing && !item.visible && "opacity-45",
            )}
          >
            {editing && (
              <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" />
                <span className="font-medium">{WIDGET_LABEL.get(item.id) ?? item.id}</span>
                <button
                  onClick={() => toggleWidget(item.id)}
                  className="ml-auto flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors hover:bg-accent"
                  title={item.visible ? "Nascondi widget" : "Mostra widget"}
                >
                  {item.visible ? (
                    <>
                      <Eye className="h-3 w-3" /> visibile
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3 w-3" /> nascosto
                    </>
                  )}
                </button>
              </div>
            )}
            {renderWidget(item.id)}
          </section>
        );
      })}
    </div>
  );
}
