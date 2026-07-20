import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  BarChart3,
  CalendarDays,
  KanbanSquare,
  Settings as SettingsIcon,
  LayoutDashboard,
  ListTodo,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { trpc } from "@/providers/trpc";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { toast } from "sonner";

/**
 * Global ⌘K palette: jump to any issue, navigate, sync, toggle theme.
 * The fastest way to operate the app without touching the mouse.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Local issues for instant jump-to-issue (cached, no extra load)
  const issues = trpc.issues.list.useQuery(
    { pageSize: 200 },
    { enabled: open, staleTime: 60_000 },
  );

  const sync = trpc.issues.sync.useMutation({
    onSuccess: (r) => toast.success(`Sincronizzate ${r.synced} issue`),
    onError: (e) => toast.error(e.message),
    onSettled: () => utils.invalidate(),
  });

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Cerca issue o azione… (esc per chiudere)" />
      <CommandList>
        <CommandEmpty>Nessun risultato.</CommandEmpty>
        <CommandGroup heading="Issue">
          {(issues.data?.issues ?? []).map((i) => (
            <CommandItem
              key={i.key}
              value={`${i.key} ${i.summary}`}
              onSelect={() => go(`/issues/${i.key}`)}
            >
              <span className="mr-2 font-mono text-xs text-muted-foreground">
                {i.key}
              </span>
              <span className="truncate">{i.summary}</span>
              {i.favorite === 1 && <span className="ml-2">★</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Navigazione">
          <CommandItem onSelect={() => go("/")}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go("/issues")}>
            <ListTodo className="mr-2 h-4 w-4" /> Issue
          </CommandItem>
          <CommandItem onSelect={() => go("/timesheet")}>
            <CalendarDays className="mr-2 h-4 w-4" /> Timesheet
          </CommandItem>
          <CommandItem onSelect={() => go("/board")}>
            <KanbanSquare className="mr-2 h-4 w-4" /> Board
          </CommandItem>
          <CommandItem onSelect={() => go("/reports")}>
            <BarChart3 className="mr-2 h-4 w-4" /> Report
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <SettingsIcon className="mr-2 h-4 w-4" /> Impostazioni
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Azioni">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              sync.mutate();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Sincronizza da Jira
            <CommandShortcut>S</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Cambia tema
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
