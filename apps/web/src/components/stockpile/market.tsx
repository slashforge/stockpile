import { useState } from "react";
import { IoCaretDown, IoCaretUp, IoChevronDown, IoChevronUp, IoDocumentTextOutline, IoRemove } from "react-icons/io5";
import { Skeleton } from "@/components/ui/layout";
import { cn, T } from "@/components/ui/type";
import {
  changeTone,
  type Curator,
  type DisclosureEvidence,
  evidenceLine,
  formatSignedPct,
  type LiquidityTier,
} from "@/lib/market";
import { pickCardReturns } from "@/lib/returns";
import type { BagReturnEntry } from "@/services/api/returns";

const TONE_ICON = { up: IoCaretUp, down: IoCaretDown, flat: IoRemove } as const;

export function toneClass(pct: number | null | undefined, muted = "text-ink-3") {
  const tone = changeTone(pct);
  if (tone === "up") return "text-positive";
  if (tone === "down") return "text-danger";
  return muted;
}

/** Minimal line chart for list cards; renders nothing below 8 finite points. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const points = values.filter(Number.isFinite);
  if (points.length < 8) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = points[points.length - 1]! >= points[0]!;
  return (
    <svg width={width} height={height} aria-label={up ? "Trend up" : "Trend down"} className="shrink-0">
      <polyline
        points={coords}
        fill="none"
        stroke={color ?? (up ? "var(--ds-positive)" : "var(--ds-danger)")}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Card performance row: 1M (or since-listing) figure, a quieter 1Y/all-time line and the 1M
 * sparkline. Skeleton while loading; "No history yet" when there is nothing.
 */
export function BagReturnsLine({
  entry,
  loading = false,
  onArt = false,
  compact = false,
}: {
  entry: BagReturnEntry | null | undefined;
  loading?: boolean;
  onArt?: boolean;
  compact?: boolean;
}) {
  const picked = pickCardReturns(entry);
  if (!picked && loading) {
    return (
      <div className={cn("flex min-h-[22px] gap-2", compact ? "flex-col items-start gap-0.5" : "items-center")} aria-label="Loading performance">
        <Skeleton height={20} width={72} radius={10} />
        <Skeleton height={12} width={compact ? 96 : 80} radius={6} />
      </div>
    );
  }
  if (!picked) {
    return (
      <div className="flex min-h-[22px] items-center">
        <T variant="caption" tone={onArt ? "inherit" : "tertiary"} className={cn("font-semibold", onArt && "text-white/85")}>
          No history yet
        </T>
      </div>
    );
  }
  const { primary, secondary } = picked;
  const tone = changeTone(primary.pct) ?? "flat";
  const Icon = TONE_ICON[tone];
  const color = tone === "up" ? "text-positive" : tone === "down" ? "text-danger" : "text-ink-2";
  const secondaryText = secondary
    ? secondary.label === "1Y"
      ? `${formatSignedPct(secondary.pct)} past year`
      : `${formatSignedPct(secondary.pct)} ${secondary.label}`
    : null;
  return (
    <div className={cn("flex min-h-[22px] gap-2", compact ? "flex-col items-start gap-0.5" : "items-center")}>
      <span className={cn("inline-flex items-center gap-[3px] rounded-full px-2 py-0.5", onArt ? "bg-surface" : "bg-sunken")}>
        <Icon size={10} className={color} />
        <T as="span" variant="caption" tone="inherit" className={cn("font-bold tabular-nums", color)}>
          {formatSignedPct(primary.pct)}
        </T>
        <T as="span" variant="caption" tone="tertiary" className="font-semibold">
          {primary.label}
        </T>
      </span>
      {secondaryText ? (
        <T
          as="span"
          variant="caption"
          tone={onArt ? "inherit" : "tertiary"}
          lines={1}
          className={cn("font-semibold tabular-nums", !compact && "flex-1", onArt && "text-white/85")}
        >
          {secondaryText}
        </T>
      ) : compact ? null : (
        <span className="flex-1" />
      )}
      {entry && primary.label === "1M" && !compact ? (
        <Sparkline values={entry.sparkline} width={60} height={20} color={onArt ? "rgba(255,255,255,0.95)" : undefined} />
      ) : null}
    </div>
  );
}

export function CuratorLine({ curator, onArt = false }: { curator: Curator | null; onArt?: boolean }) {
  if (!curator) return null;
  return (
    <T variant="caption" lines={1} tone={onArt ? "inherit" : "tertiary"} className={cn(onArt && "font-semibold text-white/85")}>
      Tracking {curator.name}
    </T>
  );
}

const TIER_TONE = {
  deep: "bg-mint-soft text-positive",
  ok: "bg-sunken text-ink-2",
  thin: "bg-caution-soft text-caution",
} as const;

export function LiquidityPill({ tier }: { tier: LiquidityTier | null }) {
  if (!tier) return null;
  return (
    <span className={cn("rounded-full px-[7px] py-0.5", TIER_TONE[tier])}>
      <T as="span" variant="caption" tone="inherit" className="font-semibold">
        {tier === "ok" ? "OK liquidity" : `${tier[0]!.toUpperCase()}${tier.slice(1)}`}
      </T>
    </span>
  );
}

export function EvidenceList({ items }: { items: DisclosureEvidence[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-7 items-center gap-1 self-start text-accent"
      >
        <IoDocumentTextOutline size={13} />
        <T as="span" variant="caption" tone="accent" className="font-semibold">
          {items.length === 1 ? "1 filing" : `${items.length} filings`}
        </T>
        {open ? <IoChevronUp size={12} /> : <IoChevronDown size={12} />}
      </button>
      {open
        ? items.map((item, index) => (
            <div key={`${item.member}-${item.txnDate ?? index}-${index}`} className="flex items-start gap-2">
              <T variant="caption" tone="secondary" className="flex-1">
                {evidenceLine(item)}
              </T>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="t-caption font-semibold text-accent hover:underline">
                  View filing
                </a>
              ) : null}
            </div>
          ))
        : null}
    </div>
  );
}
