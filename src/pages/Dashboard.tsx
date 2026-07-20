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
import { CalendarClock, CalendarDays, CalendarRange, ListTodo } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatSeconds } from "@contracts/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickLog } from "@/components/QuickLog";

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

export default function Dashboard() {
  const stats = trpc.stats.dashboard.useQuery();

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
          Nessun dato ancora. Vai su <Link to="/issues" className="text-primary underline">Issue</Link> e
          premi "Sync Jira" per importare le tue issue.
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
    { title: "Oggi", value: formatSeconds(s.todaySeconds), icon: CalendarClock },
    { title: "Questa settimana", value: formatSeconds(s.weekSeconds), icon: CalendarDays },
    { title: "Questo mese", value: formatSeconds(s.monthSeconds), icon: CalendarRange },
    { title: "Issue aperte", value: String(s.openIssueCount), icon: ListTodo },
  ];

  return (
    <div className="grid gap-4">
      <QuickLog />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ title, value, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {title}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ore registrate — ultimi 14 giorni</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} unit="h" />
                <Tooltip formatter={(v) => [`${v}h`, "Ore"]} />
                <Bar dataKey="ore" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ore per progetto — questo mese</CardTitle>
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
    </div>
  );
}
