import { Link, NavLink, useNavigate } from "react-router";
import { BarChart3, Clock, LayoutDashboard, ListTodo, CalendarDays, KanbanSquare, LogOut, RefreshCw, Search, Settings as SettingsIcon } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTimerAlerts } from "@/hooks/useTimerAlerts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ActiveTimerChip } from "@/components/TimerControls";
import { ModeToggle } from "@/components/ModeToggle";
import { CommandPalette } from "@/components/CommandPalette";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/issues", label: "Issue", icon: ListTodo },
  { to: "/timesheet", label: "Timesheet", icon: CalendarDays },
  { to: "/board", label: "Board", icon: KanbanSquare },
  { to: "/reports", label: "Report", icon: BarChart3 },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  useHotkeys();
  useTimerAlerts();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.invalidate();
      navigate("/login");
    },
    onError: () => toast.error("Logout fallito"),
  });
  const sync = trpc.issues.sync.useMutation({
    onSuccess: (r) => {
      toast.success(`Sincronizzate ${r.synced} issue da Jira`);
      utils.invalidate();
    },
    onError: (e) => toast.error(`Sync fallita: ${e.message}`),
  });

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="gradient-brand flex h-8 w-8 items-center justify-center rounded-lg shadow-md shadow-primary/25 transition-transform group-hover:scale-105">
              <Clock className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">
              Tempo
            </span>
          </Link>
          <nav className="ml-4 flex items-center gap-0.5 rounded-full border bg-muted/60 p-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                    isActive
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
                )
              }
              className="hidden items-center gap-2 rounded-full border bg-muted/60 px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              Cerca…
              <kbd className="rounded-md border bg-background px-1.5 text-[10px] font-medium">⌘K</kbd>
            </button>
            <ActiveTimerChip />
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
              Sync
            </Button>
            <Button asChild variant="ghost" size="icon" title="Impostazioni">
              <Link to="/settings">
                <SettingsIcon className="h-4 w-4" />
              </Link>
            </Button>
            <ModeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                    <AvatarFallback className="gradient-brand text-xs font-semibold text-white">
                      {user?.displayName?.slice(0, 2).toUpperCase() ?? "??"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{user?.displayName}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Esci
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
      <CommandPalette />
    </div>
  );
}
