import { IoCheckmarkCircle, IoChevronForward, IoHelpCircleOutline, IoRemove, IoTrendingDown, IoTrendingUp } from "react-icons/io5";
import { cn, T } from "@/components/ui/type";
import type { ImpactSignal, NewsPulse, StoryImpact } from "@/lib/story-impact";
import { formatBps } from "@/utils/amounts";
import { LogoCluster } from "./bag-art";
import { TokenAvatar } from "./token-avatar";

type AssetLike = { symbol: string; name: string; weightBps: number; iconUrl?: string | null };
type BagLike = { id: string; title: string; assets: { symbol: string; iconUrl: string | null | undefined; mint?: string | null }[] };

export const SIGNAL_STYLE: Record<ImpactSignal, { icon: typeof IoTrendingUp; chip: string; text: string; bar: string }> = {
  tailwind: { icon: IoTrendingUp, chip: "bg-mint-soft text-positive", text: "text-positive", bar: "bg-positive" },
  headwind: { icon: IoTrendingDown, chip: "bg-danger-soft text-danger", text: "text-danger", bar: "bg-danger" },
  neutral: { icon: IoRemove, chip: "bg-sunken text-ink-2", text: "text-ink-2", bar: "bg-ink-3/40" },
  mixed: { icon: IoRemove, chip: "bg-sunken text-ink-2", text: "text-ink-2", bar: "bg-ink-3/60" },
  unclear: { icon: IoRemove, chip: "bg-sunken text-ink-2", text: "text-ink-2", bar: "bg-ink-3/30" },
  unavailable: { icon: IoRemove, chip: "bg-sunken text-ink-2", text: "text-ink-2", bar: "bg-ink-3/15" },
};

/** Signal chip: "Tailwind", "Slight headwind", "Context". `onDark` renders on the reel's dark backdrop. */
export function ImpactChip({ impact, onDark = false, className }: { impact: StoryImpact; onDark?: boolean; className?: string }) {
  const style = SIGNAL_STYLE[impact.signal];
  const Icon = style.icon;
  const dark =
    impact.signal === "tailwind"
      ? "bg-[rgba(79,209,168,0.2)] text-[#6FE3BD]"
      : impact.signal === "headwind"
        ? "bg-[rgba(255,133,147,0.2)] text-[#FF9AA6]"
        : "bg-white/15 text-white/85";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 self-start rounded-full px-2 py-0.5",
        onDark ? dark : style.chip,
        className,
      )}
    >
      <Icon size={13} />
      <T as="span" variant="caption" tone="inherit" className="font-bold">
        {impact.label}
      </T>
    </span>
  );
}

/** "TSLAx · 6% of bag" or "Theme-level". */
export function exposureLine(impact: StoryImpact): string {
  if (impact.signal === "unavailable") return "Exposure not assessed";
  if (!impact.holdings.length) return "Theme-level, no single holding";
  const symbols = impact.holdings.slice(0, 2).map((asset) => asset.symbol).join(", ");
  const more = impact.holdings.length > 2 ? ` +${impact.holdings.length - 2}` : "";
  return `${symbols}${more} · ${formatBps(impact.exposureBps)} of bag`;
}

/** Why there is no verdict: the lib's single reason (missing vs stale), without forecast-like framing. */
export function unavailableReason(impact: StoryImpact): string {
  return impact.points[0]?.text ?? "No validated bag-specific analysis is available for this story.";
}

/**
 * The one honest state for a story without validated bag analysis. Deliberately renders no signal chip,
 * exposure bar or AI attribution: nothing was analysed, so nothing should look like it was.
 */
export function UnavailableNotice({ impact, className }: { impact: StoryImpact; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-2xl bg-sunken p-3", className)}>
      <IoHelpCircleOutline size={20} className="mt-px shrink-0 text-ink-3" aria-hidden />
      <div className="flex min-w-0 flex-col gap-0.5">
        <T variant="subhead">{impact.label}</T>
        <T variant="footnote" tone="secondary">
          {unavailableReason(impact)}
        </T>
      </div>
    </div>
  );
}

/** Compact takeaway for the dark story reel: signal, verdict and exposure. */
export function ReelImpact({ impact }: { impact: StoryImpact }) {
  const unavailable = impact.signal === "unavailable";
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-[rgba(16,19,31,0.55)] px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2">
        <ImpactChip impact={impact} onDark />
        {unavailable ? null : (
          <T as="span" variant="caption" tone="inherit" lines={1} className="font-semibold text-white/65 tabular-nums">
            {exposureLine(impact)}
          </T>
        )}
      </div>
      <T variant="footnote" tone="inherit" lines={2} className="text-white/90">
        {unavailable ? (
          unavailableReason(impact)
        ) : (
          <>
            <span className="font-semibold text-white">{impact.headline}.</span> {impact.points[0]?.text}
          </>
        )}
      </T>
    </div>
  );
}

/** Full "why it matters" breakdown for a story and one bag. */
export function ImpactBreakdown({ impact }: { impact: StoryImpact<AssetLike> }) {
  const style = SIGNAL_STYLE[impact.signal];
  if (impact.signal === "unavailable") return <UnavailableNotice impact={impact} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <ImpactChip impact={impact} />
        <T variant="headline">{impact.headline}</T>
      </div>
      {impact.holdings.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${Math.max(3, impact.exposureBps / 100)}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {impact.holdings.slice(0, 4).map((asset) => (
              <span key={asset.symbol} className="inline-flex items-center gap-1.5 rounded-full bg-sunken py-0.5 pl-0.5 pr-2">
                <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl ?? null} size={20} />
                <T as="span" variant="caption" className="font-semibold tabular-nums">
                  {asset.symbol} {formatBps(asset.weightBps)}
                </T>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <dl className="flex flex-col gap-2">
        {impact.points.map((point) => (
          <div key={point.label} className="flex flex-col gap-0.5">
            <T as="dt" variant="caption" tone="tertiary" className="font-semibold uppercase tracking-[0.6px]">
              {point.label}
            </T>
            <T as="dd" variant="footnote" tone="secondary">
              {point.text}
            </T>
          </div>
        ))}
      </dl>
      {impact.model ? (
        <T variant="caption" tone="tertiary">
          AI analysis by {impact.model} · {impact.analyzedAt?.slice(0, 10)}. Based on the supplied publisher excerpt, not the full article. Not a return forecast or investment advice.
        </T>
      ) : null}
    </div>
  );
}

/** One-line status for a bag row: the assessed exposure when there is one, else the plain signal label. */
export function compareLine(impact: StoryImpact): string {
  if (impact.signal === "unavailable") return impact.label;
  if (!impact.holdings.length) return `${impact.label} · theme-level`;
  const symbols = impact.holdings.slice(0, 3).map((asset) => asset.symbol).join(", ");
  return `${impact.label} · ${symbols} · ${formatBps(impact.exposureBps)} of bag`;
}

/**
 * Bag switcher for a story: logos, title and a one-line status per bag, selection state and chevron in
 * the same row. A thin allocation bar appears only for bags whose exposure was actually assessed.
 */
export function ImpactCompare({
  rows,
  onOpen,
  selectedBagId,
}: {
  rows: { bag: BagLike; impact: StoryImpact }[];
  onOpen: (bagId: string) => void;
  selectedBagId?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(({ bag, impact }) => {
        const selected = selectedBagId === bag.id;
        const style = SIGNAL_STYLE[impact.signal];
        const assessed = impact.signal !== "unavailable" && impact.holdings.length > 0;
        return (
          <button
            key={bag.id}
            type="button"
            onClick={() => onOpen(bag.id)}
            aria-pressed={selected}
            aria-label={`${bag.title}: ${compareLine(impact)}`}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-2xl border py-2 pl-2.5 pr-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-sunken",
            )}
          >
            <LogoCluster assets={bag.assets} size={26} limit={3} flat />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <T as="span" variant="subhead" lines={1}>
                {bag.title}
              </T>
              <span className="flex items-baseline justify-between gap-2">
                <T as="span" variant="caption" tone={assessed ? "secondary" : "tertiary"} lines={1}>
                  {assessed ? impact.label : compareLine(impact)}
                </T>
                {assessed ? (
                  <T as="span" variant="caption" tone="secondary" className="shrink-0 font-semibold tabular-nums">
                    {formatBps(impact.exposureBps)}
                  </T>
                ) : null}
              </span>
              {assessed ? (
                <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <span className={cn("block h-full rounded-full", style.bar)} style={{ width: `${Math.max(3, impact.exposureBps / 100)}%` }} />
                </span>
              ) : null}
            </span>
            {selected ? (
              <IoCheckmarkCircle className="shrink-0 text-accent" size={20} aria-hidden />
            ) : (
              <IoChevronForward className="shrink-0 text-ink-3" size={16} aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Bag-level news balance: tailwinds vs headwinds and which holdings the news is about. */
export function NewsPulseCard({ pulse }: { pulse: NewsPulse<AssetLike> }) {
  const total = pulse.tailwinds + pulse.headwinds + pulse.neutral + pulse.mixed + pulse.unclear + pulse.unavailable;
  const segments: { signal: ImpactSignal; value: number; label: string }[] = [
    { signal: "tailwind", value: pulse.tailwinds, label: "Tailwinds" },
    { signal: "neutral", value: pulse.neutral, label: "No direction" },
    { signal: "mixed", value: pulse.mixed, label: "Mixed" },
    { signal: "unclear", value: pulse.unclear, label: "Unclear" },
    { signal: "unavailable", value: pulse.unavailable, label: "Unavailable" },
    { signal: "headwind", value: pulse.headwinds, label: "Headwinds" },
  ];
  return (
    <div className="flex flex-col gap-4 rounded-[22px] bg-surface p-4 shadow-card">
      <div className="flex flex-col gap-1">
        <T variant="headline">{pulse.mood}</T>
        <T variant="footnote" tone="secondary">
          {pulse.summary}
        </T>
      </div>
      {total > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {segments
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <div
                  key={segment.signal}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", SIGNAL_STYLE[segment.signal].bar)}
                  style={{ flexGrow: segment.value }}
                />
              ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {segments.map((segment) => {
              const Icon = SIGNAL_STYLE[segment.signal].icon;
              return (
                <span key={segment.signal} className={cn("inline-flex items-center gap-1", SIGNAL_STYLE[segment.signal].text)}>
                  <Icon size={13} />
                  <T as="span" variant="caption" tone="inherit" className="font-semibold tabular-nums">
                    {segment.value} {segment.label}
                  </T>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      {pulse.holdings.length ? (
        <div className="flex flex-col">
          <T variant="caption" tone="tertiary" className="mb-1 font-semibold uppercase tracking-[0.6px]">
            Holdings in the news
          </T>
          {pulse.holdings.slice(0, 6).map((row) => {
            const signal: ImpactSignal = row.mixed || (row.tailwinds && row.headwinds) ? "mixed" : row.unclear ? "unclear" : row.tailwinds ? "tailwind" : row.headwinds ? "headwind" : "neutral";
            const Icon = SIGNAL_STYLE[signal].icon;
            return (
              <div key={row.asset.symbol} className="flex items-center gap-2.5 py-1.5">
                <TokenAvatar symbol={row.asset.symbol} iconUrl={row.asset.iconUrl ?? null} size={28} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <T as="span" variant="subhead" lines={1}>
                    {row.asset.symbol}
                  </T>
                  <T as="span" variant="caption" tone="tertiary" className="tabular-nums">
                    {formatBps(row.asset.weightBps)} of bag
                  </T>
                </div>
                <T as="span" variant="caption" tone="secondary" className="tabular-nums">
                  {[
                    row.tailwinds ? `${row.tailwinds} tailwind` : null,
                    row.headwinds ? `${row.headwinds} headwind` : null,
                    row.neutral ? `${row.neutral} no direction` : null,
                    row.mixed ? `${row.mixed} mixed` : null,
                    row.unclear ? `${row.unclear} unclear` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </T>
                <span className={cn("flex size-7 items-center justify-center rounded-full", SIGNAL_STYLE[signal].chip)}>
                  <Icon size={14} />
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      <T variant="caption" tone="tertiary">
        AI interpretation of publisher excerpts, not full articles or a forecast. Unavailable analysis is not neutral.
      </T>
    </div>
  );
}
