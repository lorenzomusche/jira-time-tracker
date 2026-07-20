/**
 * Jira-style duration parsing/formatting shared by client and server.
 * Supports inputs like: "2h 30m", "1d", "1w 2d 3h 5m", "45m", "3" (hours).
 */

const UNIT_SECONDS: Record<string, number> = {
  w: 5 * 8 * 3600, // Jira convention: 1 week = 5 working days
  d: 8 * 3600, // 1 day = 8 working hours
  h: 3600,
  m: 60,
};

export function parseDurationToSeconds(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Plain number → hours
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(parseFloat(trimmed) * 3600);
  }

  const pattern = /(\d+(?:\.\d+)?)\s*([wdhm])/g;
  let total = 0;
  let matched = "";
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(trimmed)) !== null) {
    total += parseFloat(m[1]) * UNIT_SECONDS[m[2]];
    matched += m[0];
  }
  // Reject if there is leftover unparsed content
  if (matched.replace(/\s+/g, "") !== trimmed.replace(/\s+/g, "")) {
    return null;
  }
  return Math.round(total);
}

export function formatSeconds(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const parts: string[] = [];
  let rest = totalSeconds;
  for (const [unit, secs] of Object.entries(UNIT_SECONDS)) {
    const qty = Math.floor(rest / secs);
    if (qty > 0) {
      parts.push(`${qty}${unit}`);
      rest -= qty * secs;
    }
  }
  return parts.length > 0 ? parts.join(" ") : "0m";
}

export function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

/** Jira worklog "started" format: yyyy-MM-dd'T'HH:mm:ss.SSSZ (offset without colon) */
export function toJiraStarted(date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  );
}
