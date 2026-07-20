import { Star } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function FavoriteStar({
  issueKey,
  favorite,
  className,
}: {
  issueKey: string;
  favorite: boolean;
  className?: string;
}) {
  const utils = trpc.useUtils();
  const toggle = trpc.issues.toggleFavorite.useMutation({
    onSuccess: () => utils.issues.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-8 w-8 ${className ?? ""}`}
      title={favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ key: issueKey });
      }}
    >
      <Star
        className={`h-4 w-4 ${
          favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
        }`}
      />
    </Button>
  );
}
