import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { IoAdd, IoAlertCircleOutline, IoCheckmarkCircle, IoOpenOutline } from "react-icons/io5";
import { bagTradable } from "@/components/stockpile/bag-card";
import { EvidenceList, toneClass } from "@/components/stockpile/market";
import { PriceChart, RangeChips, useChartColor } from "@/components/stockpile/price-chart";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { Divider, MessageState, Page, Skeleton } from "@/components/ui/layout";
import { cn, T } from "@/components/ui/type";
import { usePortfolio } from "@/hooks/use-account";
import { useBag, useBags } from "@/hooks/use-bags";
import { useAssetChart } from "@/hooks/use-charts";
import { useOpenBuy } from "@/hooks/use-navigation";
import { disclosureEvidence, formatPrice, formatSignedPct, formatUsdCompact, underlyingCaption } from "@/lib/market";
import { formatHoldingAmount, formatUsdValue } from "@/lib/portfolio";
import { issuerMarkLabel } from "@/lib/pre-ipo";
import { useStockpileAuth } from "@/providers/auth-context";
import { type ChartPoint, type ChartRange, isDrawable } from "@/services/api/charts";
import type { Bag, BagAsset } from "@/services/api/types";
import { formatBps } from "@/utils/amounts";

export const Route = createFileRoute("/asset/$symbol")({
  component: AssetScreen,
  validateSearch: (search: Record<string, unknown>): { bag?: string } =>
    typeof search.bag === "string" ? { bag: search.bag } : {},
});

const RANGE_WORD: Record<ChartRange, string> = {
  "1D": "Today",
  "1W": "Past week",
  "1M": "Past month",
  "1Y": "Past year",
  ALL: "All time",
};

function useAssetLookup(symbol: string, bagId: string | undefined) {
  const bag = useBag(bagId);
  const bags = useBags();
  const match = (candidate: Bag | undefined) => candidate?.assets.find((asset) => asset.symbol === symbol);
  if (bag.data) {
    const asset = match(bag.data);
    if (asset) return { asset, bag: bag.data, pending: false };
  }
  for (const candidate of bags.data ?? []) {
    const asset = match(candidate);
    if (asset) return { asset, bag: candidate, pending: false };
  }
  return { asset: undefined, bag: bag.data, pending: (!!bagId && bag.isPending) || bags.isPending };
}

function Balance({ asset }: { asset: BagAsset }) {
  const { authenticated } = useStockpileAuth();
  const portfolio = usePortfolio();
  if (!authenticated || portfolio.data?.status !== "live") return null;
  const holding = asset.mint ? portfolio.data.holdings.find((item) => item.mint === asset.mint) : undefined;
  const amount = holding?.uiAmount ? formatHoldingAmount(holding.uiAmount) : "0";
  const usd = holding ? holding.usdValue : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <T variant="subhead" tone="tertiary">
        Balance
      </T>
      <T className="truncate text-[40px] leading-[46px] font-extrabold tracking-[-1px] tabular-nums">
        {amount}
        <span className="text-[28px] font-bold text-ink-3">{` ${asset.symbol}`}</span>
      </T>
      <T variant="callout" tone="tertiary" className="tabular-nums">
        {formatUsdValue(usd)}
      </T>
    </div>
  );
}

function BuyButton({ bag }: { bag: Bag }) {
  const { configured } = useStockpileAuth();
  const openBuy = useOpenBuy();
  if (!configured || !bagTradable(bag)) return null;
  return (
    <div className="flex max-w-[110px] flex-col items-center gap-1">
      <button
        type="button"
        aria-label={`Buy the whole ${bag.title} bag`}
        onClick={() => openBuy(bag.id)}
        className="flex size-14 items-center justify-center rounded-full bg-ink text-surface transition-transform hover:scale-105 active:scale-95"
      >
        <IoAdd size={28} />
      </button>
      <T variant="subhead">Buy</T>
      <T variant="caption" tone="tertiary" lines={1}>
        via bag
      </T>
    </div>
  );
}

function PriceBlock({ asset }: { asset: BagAsset }) {
  const [range, setRange] = useState<ChartRange>("1W");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const chart = useAssetChart(asset.mint, range);
  const series = chart.isError ? undefined : chart.data;
  const points = series?.points;
  const drawable = isDrawable(points);
  const first = drawable ? points[0]! : null;
  const last = drawable ? points[points.length - 1]! : null;
  const rangePct =
    series?.changePct ?? (first && last && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null);
  const fallback24h = !drawable && rangePct == null;
  const pct =
    scrub && first && first.value > 0
      ? ((scrub.value - first.value) / first.value) * 100
      : fallback24h
        ? (asset.market?.priceChange24hPct ?? null)
        : rangePct;
  const price = scrub?.value ?? asset.market?.usdPrice ?? last?.value ?? null;
  const color = useChartColor(fallback24h ? asset.market?.priceChange24hPct : rangePct);
  const [everDrawn, setEverDrawn] = useState(false);
  if (drawable && !everDrawn) setEverDrawn(true);
  const when = scrub
    ? new Date(scrub.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : fallback24h
      ? "24h"
      : RANGE_WORD[range];

  return (
    <div className="flex flex-col gap-1.5">
      <T variant="subhead" tone="tertiary">
        {asset.symbol} Price
      </T>
      <T className="text-[40px] leading-[46px] font-extrabold tracking-[-1px] tabular-nums">{formatPrice(price)}</T>
      <div className="flex items-center gap-2">
        {pct != null ? (
          <T variant="subhead" tone="inherit" className={cn("tabular-nums", toneClass(pct))}>
            {formatSignedPct(pct, 2)}
          </T>
        ) : null}
        <T variant="subhead" tone="tertiary">
          {when}
        </T>
      </div>
      {drawable ? (
        <div className="mt-3">
          <PriceChart
            points={points}
            color={color}
            range={range}
            onScrub={setScrub}
            label={`${asset.symbol} price chart, ${RANGE_WORD[range]}, ${formatSignedPct(rangePct, 2)}`}
          />
        </div>
      ) : chart.isFetching && !everDrawn ? (
        <Skeleton height={220} radius={20} className="mt-3 opacity-60" />
      ) : asset.mint ? (
        <T variant="caption" tone="tertiary">
          Chart coming soon
        </T>
      ) : null}
      {drawable || everDrawn ? <RangeChips value={range} onChange={setRange} color={color} busy={chart.isFetching} /> : null}
    </div>
  );
}

function Details({ asset }: { asset: BagAsset }) {
  const market = asset.market;
  const reference = underlyingCaption(market?.underlying ?? undefined);
  const mark = issuerMarkLabel(asset);
  const rows: [string, string][] = [["Weight in bag", formatBps(asset.weightBps)]];
  if (market?.priceChange24hPct != null)
    rows.push([market.change24hSource === "jupiter" ? "24h (per Jupiter)" : "24h", formatSignedPct(market.priceChange24hPct)]);
  if (market?.premiumPct != null)
    rows.push([market.underlying?.source === "prestocks" ? "Vs issuer mark" : "Token vs stock", formatSignedPct(market.premiumPct)]);
  if (market?.liquidityUsd != null) rows.push(["Liquidity", formatUsdCompact(market.liquidityUsd)]);
  if (market?.volume24hUsd != null) rows.push(["24h volume", formatUsdCompact(market.volume24hUsd)]);
  if (asset.liquidityTier)
    rows.push([
      "Route depth",
      asset.liquidityTier === "ok" ? "OK" : `${asset.liquidityTier[0]!.toUpperCase()}${asset.liquidityTier.slice(1)}`,
    ]);
  return (
    <div className="flex flex-col gap-1.5">
      <T as="h2" variant="title3">
        About
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
        <Divider />
        <a
          href={asset.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 py-3 text-accent hover:opacity-80"
        >
          <T as="span" variant="callout" tone="accent" className="font-semibold">
            Why it’s included
          </T>
          <IoOpenOutline size={16} />
        </a>
      </div>
      {reference ? (
        <T variant="caption" tone="tertiary">
          {reference}
        </T>
      ) : null}
      {mark ? (
        <T variant="caption" tone="tertiary">
          {mark} · not a quote
        </T>
      ) : null}
      <EvidenceList items={disclosureEvidence(asset)} />
    </div>
  );
}

function AssetScreen() {
  const { symbol } = Route.useParams();
  const { bag: bagId } = Route.useSearch();
  const { asset, bag, pending } = useAssetLookup(symbol, bagId);

  return (
    <Page close>
      {asset && bag ? (
        <div className="flex flex-col gap-8 pt-2">
          <div className="flex items-center gap-5">
            <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} mint={asset.mint} size={120} />
            <div className="flex min-w-0 flex-1 flex-col">
              <T as="h1" lines={2} className="text-[30px] leading-[35px] font-extrabold tracking-[-0.6px]">
                {asset.name}
              </T>
              <div className="mt-1.5 flex items-center gap-1.5">
                <T variant="callout" tone="secondary" className="font-semibold">
                  {asset.symbol}
                </T>
                {asset.mint ? (
                  <IoCheckmarkCircle size={16} className="text-accent" aria-label="Verified mint" />
                ) : (
                  <T variant="caption" tone="caution" className="font-semibold">
                    Mint unverified
                  </T>
                )}
              </div>
              <T variant="footnote" tone="tertiary" lines={1} className="mt-1">
                In {bag.title}
              </T>
            </div>
          </div>
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <Balance asset={asset} />
            </div>
            <BuyButton bag={bag} />
          </div>
          <PriceBlock asset={asset} />
          <Details asset={asset} />
        </div>
      ) : pending ? (
        <div className="flex flex-col items-start gap-4 pt-2">
          <Skeleton height={120} width={120} radius={60} />
          <Skeleton height={28} width="60%" />
          <Skeleton height={220} radius={20} />
        </div>
      ) : (
        <MessageState
          tone="error"
          icon={IoAlertCircleOutline}
          title="Asset unavailable"
          body="We couldn't find this asset in any bag."
        />
      )}
    </Page>
  );
}
