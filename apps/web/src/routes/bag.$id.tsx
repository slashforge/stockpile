import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  IoAddCircle,
  IoAlertCircleOutline,
  IoBulb,
  IoDocumentText,
  IoInformationCircle,
  IoLayers,
  IoLockClosed,
  IoMail,
  IoNewspaper,
  IoOpenOutline,
  IoShieldCheckmark,
  IoTrendingDown,
  IoTrendingUp,
} from "react-icons/io5";
import { useAssetColors } from "@/components/stockpile/allocation";
import { bagTheme } from "@/components/stockpile/bag-art";
import { bagTradable, researchOnlyReason, TradeStatus } from "@/components/stockpile/bag-card";
import { toneClass } from "@/components/stockpile/market";
import { PriceChart, RangeChips, useChartColor } from "@/components/stockpile/price-chart";
import { SaveButton } from "@/components/stockpile/save-button";
import { formatStoryDate } from "@/components/stockpile/story-reel";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { PrimaryButton } from "@/components/ui/button";
import { Collapsible, Divider, MessageState, Page, Skeleton } from "@/components/ui/layout";
import { GRADIENT_CLASS } from "@/components/ui/theme";
import { cn, T } from "@/components/ui/type";
import { useBag } from "@/hooks/use-bags";
import { useBagChart } from "@/hooks/use-charts";
import { collectStories, useBagStories } from "@/hooks/use-feed";
import { useOpenBuy, useOpenSell } from "@/hooks/use-navigation";
import { useBagPosition } from "@/hooks/use-positions";
import {
  bagCurator,
  bagMarket,
  formatAsOf,
  formatImpactPct,
  formatSignedPct,
  formatUsdCompact,
} from "@/lib/market";
import { formatHoldingAmount, formatUsdValue } from "@/lib/portfolio";
import { useStockpileAuth } from "@/providers/auth-context";
import { type BagChart, type ChartPoint, type ChartRange, isDrawable } from "@/services/api/charts";
import { connectionFor, type Story } from "@/services/api/feed";
import type { BagPosition } from "@/services/api/positions";
import type { Bag } from "@/services/api/types";
import { formatBps } from "@/utils/amounts";

export const Route = createFileRoute("/bag/$id")({
  component: BagScreen,
  validateSearch: (search: Record<string, unknown>): { buy?: string } =>
    typeof search.buy === "string" || typeof search.buy === "number" ? { buy: String(search.buy) } : {},
});

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function categoryLabel(bag: Bag) {
  const issuer = bag.issuer === "prestocks" ? "PreStocks" : "xStocks";
  return bag.assetClass === "pre-ipo" ? `${issuer} · Pre-IPO` : issuer;
}

function pctBetween(from: number, to: number) {
  return from > 0 ? ((to - from) / from) * 100 : null;
}

function Hero({ bag }: { bag: Bag }) {
  const { icon: Icon, gradient } = bagTheme(bag);
  const curator = bagCurator(bag);
  return (
    <div className="mt-1 flex flex-col gap-2.5">
      <div className="flex items-center gap-4">
        <div className={cn("flex size-20 shrink-0 items-center justify-center rounded-[26px] text-white", GRADIENT_CLASS[gradient])}>
          <Icon size={34} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <T as="h1" variant="title1" lines={2} className="text-[30px] leading-[34px] md:text-[34px] md:leading-[40px]">
            {bag.title}
          </T>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-accent-soft px-[7px] py-0.5">
              <T as="span" variant="caption" tone="accent" className="font-bold">
                {categoryLabel(bag)}
              </T>
            </span>
            <TradeStatus bag={bag} />
          </div>
        </div>
      </div>
      <T variant="callout" tone="secondary">
        {bag.subtitle}
      </T>
      {curator ? (
        <T variant="footnote" tone="tertiary" lines={1}>
          Tracks {curator.name}
        </T>
      ) : null}
    </div>
  );
}

const RANGE_WORD: Record<ChartRange, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "1Y": "past year",
  ALL: "all time",
};

function formatPointDate(timestamp: number, range: ChartRange) {
  const date = new Date(timestamp);
  return range === "1D"
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(range === "ALL" || range === "1Y" ? { year: "numeric" } : {}),
      });
}

function Performance({
  bag,
  chart,
  range,
  onRange,
  loading,
  holdingUsd,
}: {
  bag: Bag;
  chart: BagChart | undefined;
  range: ChartRange;
  onRange: (range: ChartRange) => void;
  loading: boolean;
  holdingUsd: number | null;
}) {
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const points = chart?.points;
  const drawable = isDrawable(points);
  const first = drawable ? points[0]! : null;
  const last = drawable ? points[points.length - 1]! : null;
  const rangePct = chart?.changePct ?? (first && last ? pctBetween(first.value, last.value) : null);
  const market = bagMarket(bag);
  const fallback24h = !drawable && rangePct == null;
  const shownPct = scrub && first ? pctBetween(first.value, scrub.value) : fallback24h ? (market?.change24hPct ?? null) : rangePct;
  const color = useChartColor(rangePct ?? (fallback24h ? market?.change24hPct : null));
  const caption = scrub ? formatPointDate(scrub.timestamp, range) : fallback24h ? "24h" : RANGE_WORD[range];
  const [everDrawn, setEverDrawn] = useState(false);
  if (drawable && !everDrawn) setEverDrawn(true);

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <T variant="footnote" tone="tertiary" className="font-semibold">
          Bag index
        </T>
        <T
          className={cn(
            "text-[46px] leading-[52px] font-extrabold tracking-[-1.2px] tabular-nums",
            shownPct == null ? "text-ink-3" : toneClass(shownPct),
          )}
        >
          {shownPct == null ? "—" : formatSignedPct(shownPct, 2)}
        </T>
        <div className="flex items-center gap-2">
          <T variant="subhead" tone="secondary">
            {caption}
          </T>
          {holdingUsd != null ? (
            <>
              <span className="size-[3px] rounded-full bg-ink-3" />
              <T variant="subhead" tone="secondary" className="tabular-nums">
                You hold {formatUsdValue(holdingUsd)}
              </T>
            </>
          ) : null}
        </div>
      </div>
      {drawable ? (
        <PriceChart
          points={points}
          color={color}
          range={range}
          height={240}
          onScrub={setScrub}
          label={`Bag index chart, ${RANGE_WORD[range]}, ${formatSignedPct(rangePct, 2)}`}
        />
      ) : loading && !everDrawn ? (
        <Skeleton height={240} radius={20} className="opacity-60" />
      ) : (
        <T variant="caption" tone="tertiary">
          Chart coming soon
        </T>
      )}
      {drawable || everDrawn ? <RangeChips value={range} onChange={onRange} color={color} busy={loading} /> : null}
    </div>
  );
}

function Block({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <T as="h2" variant="title3">
          {title}
        </T>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function Holdings({ bag, chart }: { bag: Bag; chart: BagChart | undefined }) {
  const colors = useAssetColors(bag.assets);
  const legs = useMemo(
    () => new Map((chart?.legs ?? []).filter((leg) => leg.mint && leg.changePct != null).map((leg) => [leg.mint, leg])),
    [chart?.legs],
  );
  // Range change only when every leg has its own series; otherwise the 24h figures, consistently.
  const hasLegs = legs.size > 0 && legs.size === bag.assets.length;
  return (
    <Block
      title="Holdings"
      trailing={
        <T variant="footnote" tone="tertiary">
          {bag.assets.length} assets · {hasLegs ? "range" : "24h"} change
        </T>
      }
    >
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-[3px]">
        {bag.assets.map((asset, index) => (
          <div key={`${asset.symbol}-${index}`} style={{ flex: asset.weightBps, backgroundColor: colors[index] }} />
        ))}
      </div>
      <div className="flex flex-col">
        {bag.assets.map((asset, index) => {
          const leg = asset.mint ? legs.get(asset.mint) : undefined;
          const pct = hasLegs ? (leg?.changePct ?? null) : (asset.market?.priceChange24hPct ?? null);
          return (
            <div key={`${asset.symbol}-${index}`}>
              {index > 0 ? <Divider inset={62} /> : null}
              <Link
                to="/asset/$symbol"
                params={{ symbol: asset.symbol }}
                search={{ bag: bag.id }}
                className="-mx-2 flex items-center gap-2.5 rounded-2xl px-2 py-3 transition-colors hover:bg-sunken"
              >
                <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} size={52} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <T variant="headline" lines={1}>
                    {asset.symbol}
                  </T>
                  <T variant="footnote" tone={asset.mint ? "secondary" : "caution"} lines={1}>
                    {asset.mint ? asset.name : `${asset.name} · mint unverified`}
                  </T>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <T variant="headline" className="tabular-nums">
                    {formatBps(asset.weightBps)}
                  </T>
                  <T variant="footnote" tone="inherit" className={cn("font-semibold tabular-nums", toneClass(pct))}>
                    {formatSignedPct(pct)}
                  </T>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </Block>
  );
}

function Facts({ bag }: { bag: Bag }) {
  const market = bagMarket(bag);
  const asOf = formatAsOf(market?.asOf);
  const rows: [string, string][] = [];
  if (market?.premiumPct != null) rows.push(["Token vs stock", formatSignedPct(market.premiumPct)]);
  if (market?.worstImpactSymbol && market.worstImpactPct != null)
    rows.push(["Thinnest route", `${market.worstImpactSymbol} · ${formatImpactPct(market.worstImpactPct)} @ $10`]);
  if (market?.worstLiquidityUsd != null)
    rows.push([
      "Smallest pool",
      `${market.worstLiquiditySymbol ? `${market.worstLiquiditySymbol} · ` : ""}${formatUsdCompact(market.worstLiquidityUsd)}`,
    ]);
  rows.push(["Sources", `${bag.sources.length} ${bag.sources.length === 1 ? "source" : "sources"}`]);
  return (
    <div className="flex flex-col gap-2">
      <T as="h2" variant="title3">
        Market
      </T>
      <div className="flex flex-col">
        {rows.map(([label, value], index) => (
          <div key={label}>
            {index > 0 ? <Divider /> : null}
            <div className="flex items-center justify-between gap-3 py-3">
              <T variant="callout" tone="secondary" lines={1}>
                {label}
              </T>
              <T variant="callout" className="font-semibold tabular-nums">
                {value}
              </T>
            </div>
          </div>
        ))}
      </div>
      {asOf ? (
        <T variant="caption" tone="tertiary">
          Market data {asOf}. Not a quote.
        </T>
      ) : null}
    </div>
  );
}

/** What the signed-in user holds of this bag, token by token. */
function YourTokens({ position, bag }: { position: BagPosition; bag: Bag }) {
  const legs = position.legs.filter((leg) => leg.held !== "0");
  return (
    <Block
      title="Your tokens"
      trailing={
        <T variant="footnote" tone="inherit" className={cn("tabular-nums", toneClass(position.pnlPct, "text-ink-2"))}>
          {formatUsdValue(position.valueUsd)}
          {position.pnlPct != null ? ` · ${formatSignedPct(position.pnlPct)}` : ""}
        </T>
      }
    >
      <div className="flex flex-col">
        {legs.map((leg, index) => {
          const asset = bag.assets.find((candidate) => candidate.mint === leg.mint);
          const amount = `${formatHoldingAmount(String(leg.heldUi))} ${leg.symbol}`;
          return (
            <div key={leg.mint}>
              {index > 0 ? <Divider inset={50} /> : null}
              <div className="flex items-center gap-2.5 py-3">
                <TokenAvatar symbol={leg.symbol} mint={leg.mint} iconUrl={leg.iconUrl ?? asset?.iconUrl ?? null} size={40} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <T variant="headline" lines={1}>
                    {leg.symbol}
                  </T>
                  <T variant="footnote" tone="secondary" lines={1} className="tabular-nums">
                    {amount}
                  </T>
                </div>
                <T variant="headline" className="tabular-nums">
                  {formatUsdValue(leg.usdValue)}
                </T>
              </div>
            </div>
          );
        })}
      </div>
      {!position.reconciled ? (
        <T variant="caption" tone="caution">
          Some of this bag’s tokens moved out of your wallet, so it shows what’s still there.
        </T>
      ) : null}
    </Block>
  );
}

const STANCE = {
  supporting: { label: "Supports", icon: IoTrendingUp, className: "bg-mint-soft text-positive" },
  opposing: { label: "Challenges", icon: IoTrendingDown, className: "bg-coral-soft text-danger" },
  neutral: { label: "Context", icon: IoInformationCircle, className: "bg-sunken text-ink-2" },
} as const;

function StoryRow({ story, bagId }: { story: Story; bagId: string }) {
  const connection = connectionFor(story, bagId);
  const stance = connection ? STANCE[connection.context] : null;
  const date = formatStoryDate(story.publishedAt);
  return (
    <a
      href={story.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col gap-1.5 rounded-[14px] bg-canvas p-2.5 transition-opacity hover:opacity-80"
    >
      {stance ? (
        <span className={cn("inline-flex items-center gap-1 self-start rounded-full px-[7px] py-0.5", stance.className)}>
          <stance.icon size={12} />
          <T as="span" variant="caption" tone="inherit" className="font-semibold">
            {stance.label}
          </T>
        </span>
      ) : null}
      <T variant="callout" lines={3} className="font-semibold">
        {story.title}
      </T>
      {connection?.explanation ? (
        <T variant="footnote" tone="secondary" lines={3}>
          {connection.explanation}
        </T>
      ) : null}
      <T variant="caption" tone="tertiary">
        {story.publisher}
        {date ? ` · ${date}` : ""} · {hostOf(story.sourceUrl)}
        {story.format === "podcast" ? " · Podcast" : ""}
        {story.provenance === "ai" ? " · AI summary" : ""}
      </T>
    </a>
  );
}

function RelatedStories({ bagId }: { bagId: string }) {
  const stories = useBagStories(bagId);
  if (stories.isPending) return <Skeleton height={64} radius={18} />;
  const result = collectStories(stories.data?.pages);
  const list = result.status === "live" ? result.stories : [];
  const count = (context: "supporting" | "opposing") =>
    list.filter((story) => connectionFor(story, bagId)?.context === context).length;
  const summary = stories.isError
    ? "Couldn't load stories"
    : result.status === "unavailable"
      ? result.message
      : list.length === 0
        ? "No related stories yet"
        : `${count("supporting")} supporting · ${count("opposing")} challenging`;
  return (
    <Collapsible title="Stories" icon={IoNewspaper} tint="coral" count={list.length || undefined} summary={summary}>
      {list.length === 0 ? (
        <T variant="footnote" tone="secondary">
          {summary}
        </T>
      ) : (
        <>
          {list.map((story) => (
            <StoryRow key={story.id} story={story} bagId={bagId} />
          ))}
          {stories.hasNextPage ? (
            <PrimaryButton
              label="More stories"
              variant="ghost"
              size="md"
              loading={stories.isFetchingNextPage}
              onClick={() => stories.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </Collapsible>
  );
}

// Fallback only; the API supplies bag-specific risks.
const GENERAL_RISKS = [
  "Inclusion and weights are Stockpile's reading of the sources, not claims by them or a recommendation.",
  "Tokenized stocks are issued by third parties, may not carry shareholder rights and can trade away from the share price.",
  "Prices can fall. Swaps have slippage and network fees, and you may lose money.",
];

function DetailSkeleton() {
  return (
    <div className="mt-1 flex flex-col gap-3" aria-label="Loading bag">
      <div className="flex items-center gap-4">
        <Skeleton height={80} width={80} radius={26} />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton height={28} width="80%" />
          <Skeleton height={16} width="40%" />
        </div>
      </div>
      <Skeleton height={44} width="45%" />
      <Skeleton height={220} radius={20} />
    </div>
  );
}

/** Buy / sell actions and position summary. Footer on small screens, side card on large ones. */
function TradeActions({ bag, position }: { bag: Bag; position: BagPosition | null }) {
  const auth = useStockpileAuth();
  const openBuy = useOpenBuy();
  const openSell = useOpenSell();
  if (!auth.configured) return null;
  const tradable = bagTradable(bag);
  return (
    <>
      {!tradable ? (
        <div className="flex items-center justify-center gap-1.5 text-ink-2">
          <IoLockClosed size={13} className="shrink-0" />
          <T variant="footnote" tone="secondary">
            {researchOnlyReason(bag)}
          </T>
        </div>
      ) : null}
      {position ? (
        <div className="flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2 text-accent">
          <IoLayers size={14} className="shrink-0" />
          <T variant="footnote" lines={1} className="flex-1 tabular-nums">
            You hold ≈ {formatUsdValue(position.valueUsd)}
            {position.pnlPct != null ? (
              <T as="span" variant="footnote" tone="inherit" className={toneClass(position.pnlPct, "text-ink-2")}>
                {" "}· {formatSignedPct(position.pnlPct)} since buy
              </T>
            ) : null}
          </T>
        </div>
      ) : null}
      {position && auth.authenticated ? (
        <div className="flex gap-2">
          {position.sellable ? <PrimaryButton className="flex-1" label="Sell" variant="outline" onClick={() => openSell(bag.id)} /> : null}
          {tradable ? <PrimaryButton className="flex-1" label="Buy more" icon={IoAddCircle} onClick={() => openBuy(bag.id)} /> : null}
        </div>
      ) : null}
      {tradable && !(position && auth.authenticated) ? (
        <PrimaryButton
          label={auth.authenticated ? "Put money in the bag" : "Sign in to buy"}
          icon={auth.authenticated ? IoAddCircle : IoMail}
          onClick={() => openBuy(bag.id)}
        />
      ) : null}
    </>
  );
}

function BagScreen() {
  const { id } = Route.useParams();
  const { buy } = Route.useSearch();
  const navigate = useNavigate();
  const bag = useBag(id);
  const [range, setRange] = useState<ChartRange>("1M");
  const chart = useBagChart(id, range);
  const openBuy = useOpenBuy();
  const { configured } = useStockpileAuth();
  const { position } = useBagPosition(id);

  // `/bag/<id>?buy=1` opens "Put money in the bag" once the bag has loaded (same as the mobile deep link).
  const autoBuyDone = useRef(false);
  const loaded = !!bag.data;
  useEffect(() => {
    if (buy !== "1" || !loaded || autoBuyDone.current) return;
    autoBuyDone.current = true;
    navigate({ to: "/bag/$id", params: { id }, search: {}, replace: true });
    openBuy(id);
  }, [buy, loaded, id, openBuy, navigate]);

  if (!bag.data) {
    return (
      <Page back>
        {bag.isError ? (
          <MessageState
            tone="error"
            icon={IoAlertCircleOutline}
            title="Bag unavailable"
            body={bag.error.message}
            actionLabel="Try again"
            onAction={() => bag.refetch()}
          />
        ) : (
          <DetailSkeleton />
        )}
      </Page>
    );
  }

  const data = bag.data;
  const chartData = chart.isError ? undefined : chart.data;
  return (
    <Page
      back
      wide
      right={<SaveButton bagId={data.id} title={data.title} variant="circle" />}
      footer={configured ? <TradeActions bag={data} position={position} /> : undefined}
      footerClassName="lg:hidden"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col">
          <Hero bag={data} />
          <Performance
            bag={data}
            chart={chartData}
            range={range}
            onRange={setRange}
            loading={chart.isFetching}
            holdingUsd={position?.valueUsd ?? null}
          />
          {position ? <YourTokens position={position} bag={data} /> : null}
          <Holdings bag={data} chart={chartData} />
          <div className="mt-7 lg:hidden">
            <Facts bag={data} />
          </div>
          <div className="mt-7 flex flex-col gap-2">
            <Collapsible title="Why this bag" icon={IoBulb} tint="accent" summary={data.thesis}>
              <T variant="callout" className="whitespace-pre-line">
                {data.thesis}
              </T>
              {data.description ? (
                <T variant="footnote" tone="secondary" className="whitespace-pre-line">
                  {data.description}
                </T>
              ) : null}
            </Collapsible>
            <RelatedStories bagId={data.id} />
            <Collapsible
              title="Evidence"
              icon={IoDocumentText}
              tint="tertiary"
              count={data.sources.length}
              defaultOpen={bagCurator(data) != null && data.sources.length > 0}
              summary={data.sources.length ? data.sources.map((s) => hostOf(s.url)).join(" · ") : "No sources attached yet"}
            >
              {data.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-[14px] bg-canvas p-2.5 transition-opacity hover:opacity-80"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <T as="span" variant="callout" lines={3} className="font-semibold">
                      {source.title}
                    </T>
                    <T as="span" variant="footnote" tone="secondary">
                      {hostOf(source.url)}
                    </T>
                  </span>
                  <IoOpenOutline size={16} className="shrink-0 text-accent" />
                </a>
              ))}
            </Collapsible>
            <Collapsible title="Risks & disclosure" icon={IoShieldCheckmark} tint="caution" summary={data.disclosure}>
              <T variant="callout">{data.disclosure}</T>
              {(data.risks.length > 0 ? data.risks : GENERAL_RISKS).map((risk) => (
                <div key={risk} className="flex items-start gap-2">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-caution" />
                  <T variant="footnote" tone="secondary">
                    {risk}
                  </T>
                </div>
              ))}
            </Collapsible>
          </div>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-20 flex flex-col gap-4">
            {configured ? (
              <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4 shadow-card">
                <TradeActions bag={data} position={position} />
              </div>
            ) : null}
            <div className="rounded-3xl bg-surface p-4 shadow-card">
              <Facts bag={data} />
            </div>
          </div>
        </aside>
      </div>
    </Page>
  );
}
