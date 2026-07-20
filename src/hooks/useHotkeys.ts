import { useEffect } from "react";
import { useNavigate } from "react-router";

const SEQUENCES: Record<string, string> = {
  "g d": "/",
  "g i": "/issues",
  "g t": "/timesheet",
  "g b": "/board",
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** GitHub-style keyboard sequences: press "g" then a letter to navigate. */
export function useHotkeys() {
  const navigate = useNavigate();
  useEffect(() => {
    let buffer = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      buffer = `${buffer} ${e.key}`.trim().slice(-3);
      const target = SEQUENCES[buffer];
      clearTimeout(timer);
      if (target) {
        buffer = "";
        navigate(target);
        return;
      }
      timer = setTimeout(() => (buffer = ""), 1000);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [navigate]);
}
