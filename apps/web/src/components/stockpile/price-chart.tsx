import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toneHex, useScheme } from "@/components/ui/theme";
import { cn } from "@/components/ui/type";
import { changeTone } from "@/lib/market";
import { CHART_RANGES, type ChartPoint, type ChartRange, isDrawable } from "@/services/api/charts";

/** Green / red by direction; brand blue when flat or unknown. */
export function useChartColor(changePct: number | null | undefined) {
  const scheme = useScheme();
  const tone = changeTone(changePct);
  if (tone === "up") return toneHex[scheme].positive;
  if (tone === "down") return toneHex[scheme].danger;
  return toneHex[scheme].accent;
}

const DATETIME_OPTIONS: Record<ChartRange, Intl.DateTimeFormatOptions> = {
  "1D": { hour: "numeric", minute: "2-digit" },
  "1W": { weekday: "short", hour: "numeric" },
  "1M": { month: "short", day: "numeric" },
  "1Y": { month: "short", day: "numeric", year: "numeric" },
  ALL: { month: "short", day: "numeric", year: "numeric" },
};

function useWidth<T extends HTMLElement>(mounted: boolean) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, [mounted]);
  return { ref, width };
}

const Y_GUTTER = 20;

/**
 * Line chart with gradient fill, crosshair and a date tooltip. Renders nothing for fewer than two
 * points. `onScrub` receives the point under the pointer, then `null` on leave.
 */
export function PriceChart({
  points,
  color,
  range,
  height = 220,
  onScrub,
  label,
}: {
  points: ChartPoint[] | undefined;
  color: string;
  range: ChartRange;
  height?: number;
  onScrub?: (point: ChartPoint | null) => void;
  label?: string;
}) {
  const gradientId = useId();
  const { ref, width } = useWidth<HTMLDivElement>(isDrawable(points));
  const [active, setActive] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (!isDrawable(points) || width <= 0) return null;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const t0 = points[0]!.timestamp;
    const t1 = points[points.length - 1]!.timestamp;
    const tSpan = t1 - t0 || 1;
    const coords = points.map((point) => ({
      x: ((point.timestamp - t0) / tSpan) * width,
      y: Y_GUTTER + (1 - (point.value - min) / span) * (height - Y_GUTTER * 2),
    }));
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { coords, line, area };
  }, [points, width, height]);

  if (!isDrawable(points)) return null;

  const pick = (clientX: number, target: HTMLElement) => {
    if (!geometry) return;
    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    let bestDistance = Infinity;
    geometry.coords.forEach((c, index) => {
      const distance = Math.abs(c.x - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best !== active) {
      setActive(best);
      onScrub?.(points[best] ?? null);
    }
  };

  const release = () => {
    setActive(null);
    onScrub?.(null);
  };

  const dot = active != null && geometry ? geometry.coords[active] : null;
  const activePoint = active != null ? points[active] : null;

  return (
    <div
      ref={ref}
      className="relative w-full touch-pan-y select-none"
      style={{ height }}
      role="img"
      aria-label={label}
      onPointerMove={(event) => pick(event.clientX, event.currentTarget)}
      onPointerDown={(event) => pick(event.clientX, event.currentTarget)}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      {geometry ? (
        <svg width={width} height={height} className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path d={geometry.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {dot ? (
            <>
              <line x1={dot.x} x2={dot.x} y1={0} y2={height} stroke={color} strokeOpacity={0.35} strokeDasharray="3 4" />
              <circle cx={dot.x} cy={dot.y} r={10} fill={color} fillOpacity={0.2} />
              <circle cx={dot.x} cy={dot.y} r={5} fill={color} stroke="var(--ds-surface)" strokeWidth={2} />
            </>
          ) : null}
        </svg>
      ) : null}
      {dot && activePoint ? (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-full bg-surface px-2 py-1 text-[12px] font-semibold tabular-nums text-ink-2 shadow-card"
          style={{ left: Math.min(Math.max(dot.x, 56), width - 56) }}
        >
          {new Date(activePoint.timestamp).toLocaleString("en-US", DATETIME_OPTIONS[range])}
        </div>
      ) : null}
    </div>
  );
}

/** 1D / 1W / 1M / 1Y / ALL selector shown under a chart. */
export function RangeChips({
  value,
  onChange,
  color,
  busy,
}: {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
  color: string;
  busy?: boolean;
}) {
  return (
    <div role="tablist" className="flex justify-between gap-2 px-2">
      {CHART_RANGES.map((range) => {
        const active = range === value;
        return (
          <button
            key={range}
            type="button"
            role="tab"
            aria-selected={active}
            aria-busy={(active && busy) || undefined}
            onClick={() => !active && onChange(range)}
            className={cn("t-subhead flex-1 rounded-full py-2 font-bold tabular-nums transition-colors", !active && "text-ink-3 hover:bg-sunken")}
            style={active ? { color, backgroundColor: `${color}1A` } : undefined}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}
