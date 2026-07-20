import { Badge } from "@/components/ui/badge";

/** Status badge with semantic colors driven by the Jira status category. */
export function StatusBadge({
  status,
  category,
  className,
}: {
  status: string;
  category: string;
  className?: string;
}) {
  const styles =
    category === "Done"
      ? "border-transparent bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
      : category === "In Progress"
        ? "border-transparent bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]"
        : "border-transparent bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`font-medium ${styles} ${className ?? ""}`}>
      {status}
    </Badge>
  );
}
