import { formatSeconds } from "@contracts/time";

/** Native SVG progress ring for hour goals. */
export function GoalRing({
  current,
  target,
  size = 72,
  stroke = 7,
  label,
}: {
  current: number;
  target: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const pct = target > 0 ? Math.min(1, current / target) : 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const done = pct >= 1;
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? "hsl(var(--success))" : "hsl(var(--primary))"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          className="transition-all duration-700"
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="rotate-90 fill-current font-display text-sm font-semibold"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div>
        {label && <div className="text-xs font-medium text-muted-foreground">{label}</div>}
        <div className="font-display text-lg font-semibold tracking-tight">
          {formatSeconds(current)}
          <span className="text-sm font-normal text-muted-foreground">
            {" "}/ {formatSeconds(target)}
          </span>
        </div>
        {done && <div className="text-xs font-medium text-[hsl(var(--success))]">Obiettivo raggiunto 🎉</div>}
      </div>
    </div>
  );
}
