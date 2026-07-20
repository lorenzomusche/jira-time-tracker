import { Link, NavLink, useNavigate } from "react-router";
import { Clock, LayoutDashboard, ListTodo, CalendarDays, LogOut, RefreshCw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
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

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/issues", label: "Issue", icon: ListTodo },
  { to: "/timesheet", label: "Timesheet", icon: CalendarDays },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Clock className="h-5 w-5 text-primary" />
            Jira Time Tracker
          </Link>
          <nav className="ml-6 flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ActiveTimerChip />
            <ModeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
              Sync Jira
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                    <AvatarFallback>
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
    </div>
  );
}
