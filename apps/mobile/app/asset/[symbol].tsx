import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bagTradable } from "@/components/stockpile/bag-card";
import { Divider, MessageState, Skeleton } from "@/components/stockpile/layout";
import { EvidenceList } from "@/components/stockpile/market";
import {
  PriceChart,
  RangeChips,
  useChartColor,
} from "@/components/stockpile/price-chart";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { T } from "@/components/stockpile/type";
import { useOpenBuy } from "@/hooks/use-open-buy";
import { density } from "@/config/sizing";
import { usePortfolio } from "@/hooks/use-account";
import { useBag, useBags } from "@/hooks/use-bags";
import { useAssetChart } from "@/hooks/use-charts";
import { useStockpileAuth } from "@/providers/auth-context";
import { issuerMarkLabel } from "@/lib/pre-ipo";
import {
  changeTone,
  disclosureEvidence,
  formatPrice,
  formatSignedPct,
  formatUsdCompact,
  underlyingCaption,
} from "@/lib/market";
import { formatHoldingAmount, formatUsdValue } from "@/lib/portfolio";
import {
  type ChartPoint,
  type ChartRange,
  isDrawable,
} from "@/services/api/charts";
import type { Bag, BagAsset } from "@/services/api/types";
import { formatBps } from "@/utils/amounts";
import { HapticPressable } from "@/components/stockpile/haptic-pressable";

const RANGE_WORD: Record<ChartRange, string> = {
  "1D": "Today",
  "1W": "Past week",
  "1M": "Past month",
  "1Y": "Past year",
  ALL: "All time",
};

function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

function useAssetLookup(symbol: string | undefined, bagId: string | undefined) {
  const bag = useBag(bagId);
  const bags = useBags();
  const match = (candidate: Bag | undefined) =>
    candidate?.assets.find((asset) => asset.symbol === symbol);
  if (bag.data) {
    const asset = match(bag.data);
    if (asset) return { asset, bag: bag.data, pending: false };
  }
  for (const candidate of bags.data ?? []) {
    const asset = match(candidate);
    if (asset) return { asset, bag: candidate, pending: false };
  }
  return {
    asset: undefined,
    bag: bag.data,
    pending: (!!bagId && bag.isPending) || bags.isPending,
  };
}

function Balance({ asset }: { asset: BagAsset }) {
  const { authenticated } = useStockpileAuth();
  const portfolio = usePortfolio();
  if (!authenticated || portfolio.data?.status !== "live") return null;
  const holding = asset.mint
    ? portfolio.data.holdings.find((item) => item.mint === asset.mint)
    : undefined;
  const amount = holding?.uiAmount ? formatHoldingAmount(holding.uiAmount) : "0";
  const usd = holding ? holding.usdValue : 0;
  return (
    <View style={styles.group}>
      <T variant="subhead" tone="tertiary">
        Balance
      </T>
      <View style={styles.balanceRow}>
        <T style={styles.balanceNumber} numberOfLines={1} adjustsFontSizeToFit>
          {amount}
          <T style={styles.balanceSymbol}>{` ${asset.symbol}`}</T>
        </T>
      </View>
      <T variant="callout" tone="tertiary" style={styles.tabular}>
        {formatUsdValue(usd)}
      </T>
    </View>
  );
}

function BuyButton({ bag }: { bag: Bag }) {
  const { theme } = useUnistyles();
  const { configured } = useStockpileAuth();
  const openBuy = useOpenBuy();
  if (!configured || !bagTradable(bag)) return null;
  return (
    <View style={styles.buyWrap}>
      <HapticPressable
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel="Buy"
        accessibilityHint={`Buys the whole ${bag.title} bag`}
        onPress={() => {
          // Buying is per bag: close this page, then present the bag's buy sheet over the detail.
          close();
          setTimeout(() => openBuy(bag.id), 350);
        }}
        style={({ pressed }) => [styles.buyButton, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={28} color={theme.ds.surface} />
      </HapticPressable>
      <T variant="subhead" style={styles.bold}>
        Buy
      </T>
      <T variant="caption" tone="tertiary" numberOfLines={1}>
        via bag
      </T>
    </View>
  );
}

function PriceBlock({ asset }: { asset: BagAsset }) {
  const [range, setRange] = useState<ChartRange>("1W");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const chart = useAssetChart(asset.mint, range);
  const series = chart.isError ? undefined : chart.data;
  const points = series?.points;
  const drawable = isDrawable(points);
  const first = drawable ? points[0] : null;
  const last = drawable ? points[points.length - 1] : null;
  const rangePct =
    series?.changePct ??
    (first && last && first.value > 0
      ? ((last.value - first.value) / first.value) * 100
      : null);
  const fallback24h = !drawable && rangePct == null;
  const pct = scrub && first && first.value > 0
    ? ((scrub.value - first.value) / first.value) * 100
    : fallback24h
      ? (asset.market?.priceChange24hPct ?? null)
      : rangePct;
  const price = scrub?.value ?? asset.market?.usdPrice ?? last?.value ?? null;
  const color = useChartColor(fallback24h ? asset.market?.priceChange24hPct : rangePct);
  const { theme } = useUnistyles();
  const tone = changeTone(pct);
  const pctColor =
    tone === "up" ? theme.ds.positive : tone === "down" ? theme.ds.danger : theme.ds.inkTertiary;
  const [everDrawn, setEverDrawn] = useState(false);
  if (drawable && !everDrawn) setEverDrawn(true);
  const when = scrub
    ? new Date(scrub.timestamp).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : fallback24h
      ? "24h"
      : RANGE_WORD[range];

  return (
    <View style={styles.group}>
      <T variant="subhead" tone="tertiary">
        {asset.symbol} Price
      </T>
      <T style={styles.price}>{formatPrice(price)}</T>
      <View style={styles.changeRow}>
        {pct != null ? (
          <T variant="subhead" style={[styles.bold, styles.tabular, { color: pctColor }]}>
            {formatSignedPct(pct, 2)}
          </T>
        ) : null}
        <T variant="subhead" tone="tertiary">
          {when}
        </T>
      </View>
      {drawable ? (
        <View style={styles.chart}>
          <PriceChart
            points={points}
            color={color}
            range={range}
            bleed={density.gutter + 4}
            onScrub={setScrub}
            accessibilityLabel={`${asset.symbol} price chart, ${RANGE_WORD[range]}, ${formatSignedPct(rangePct, 2)}`}
          />
        </View>
      ) : chart.isFetching && !everDrawn ? (
        <View style={styles.chartSkeleton}>
          <Skeleton height={220} radius={0} />
        </View>
      ) : asset.mint ? (
        <T variant="caption" tone="tertiary">
          Chart coming soon
        </T>
      ) : null}
      {drawable || everDrawn ? (
        <RangeChips value={range} onChange={setRange} color={color} busy={chart.isFetching} />
      ) : null}
    </View>
  );
}

function Details({ asset }: { asset: BagAsset }) {
  const { theme } = useUnistyles();
  const market = asset.market;
  const reference = underlyingCaption(market?.underlying ?? null);
  const mark = issuerMarkLabel(asset);
  const rows: [string, string][] = [["Weight in bag", formatBps(asset.weightBps)]];
  if (market?.priceChange24hPct != null)
    rows.push([
      market.change24hSource === "jupiter" ? "24h (per Jupiter)" : "24h",
      formatSignedPct(market.priceChange24hPct),
    ]);
  if (market?.premiumPct != null)
    rows.push([
      market.underlying?.source === "prestocks" ? "Vs issuer mark" : "Token vs stock",
      formatSignedPct(market.premiumPct),
    ]);
  if (market?.liquidityUsd != null)
    rows.push(["Liquidity", formatUsdCompact(market.liquidityUsd)]);
  if (market?.volume24hUsd != null)
    rows.push(["24h volume", formatUsdCompact(market.volume24hUsd)]);
  if (asset.liquidityTier)
    rows.push([
      "Route depth",
      asset.liquidityTier === "ok"
        ? "OK"
        : `${asset.liquidityTier[0].toUpperCase()}${asset.liquidityTier.slice(1)}`,
    ]);
  const evidence = disclosureEvidence(asset);
  return (
    <View style={styles.group}>
      <T variant="title3" accessibilityRole="header">
        About
      </T>
      <View>
        {rows.map(([label, value], index) => (
          <View key={label}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.fact}>
              <T variant="callout" tone="secondary" numberOfLines={1} style={styles.flex}>
                {label}
              </T>
              <T variant="callout" style={[styles.bold, styles.tabular]}>
                {value}
              </T>
            </View>
          </View>
        ))}
        <Divider />
        <HapticPressable
          accessibilityRole="link"
          accessibilityLabel="Why it's included. Opens the source"
          onPress={() => WebBrowser.openBrowserAsync(asset.sourceUrl).catch(() => {})}
          style={({ pressed }) => [styles.fact, pressed && styles.pressed]}
        >
          <T variant="callout" tone="accent" style={styles.bold}>
            Why it’s included
          </T>
          <Ionicons name="open-outline" size={16} color={theme.ds.accent} />
        </HapticPressable>
      </View>
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
      <EvidenceList items={evidence} />
    </View>
  );
}

export default function AssetScreen() {
  const { symbol, bag: bagId } = useLocalSearchParams<{ symbol: string; bag?: string }>();
  const { asset, bag, pending } = useAssetLookup(symbol, bagId);
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const top = Platform.OS === "ios" ? 12 : insets.top + 8;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: top }]}>
        <View style={styles.headerSide} />
        <T variant="headline" numberOfLines={1} style={styles.headerTitle}>
          {asset?.symbol ?? symbol}
        </T>
        <HapticPressable
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          onPress={close}
          style={({ pressed }) => [styles.headerSide, styles.closeButton, pressed && styles.pressed]}
        >
          <T variant="callout" tone="accent" style={styles.bold}>
            Close
          </T>
        </HapticPressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {asset && bag ? (
          <>
            <View style={styles.identity}>
              <TokenAvatar
                symbol={asset.symbol}
                iconUrl={asset.iconUrl}
                mint={asset.mint}
                size={120}
              />
              <View style={styles.flex}>
                <T style={styles.name} numberOfLines={2} accessibilityRole="header">
                  {asset.name}
                </T>
                <View style={styles.symbolRow}>
                  <T variant="callout" tone="secondary" style={styles.bold}>
                    {asset.symbol}
                  </T>
                  {asset.mint ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={theme.ds.accent}
                      accessibilityLabel="Verified mint"
                    />
                  ) : (
                    <T variant="caption" tone="caution" style={styles.bold}>
                      Mint unverified
                    </T>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.balanceBuy}>
              <View style={styles.flex}>
                <Balance asset={asset} />
              </View>
              <BuyButton bag={bag} />
            </View>

            <PriceBlock asset={asset} />
            <Details asset={asset} />
          </>
        ) : pending ? (
          <View style={styles.loading}>
            <Skeleton height={120} width={120} radius={60} />
            <Skeleton height={28} width="60%" />
            <Skeleton height={220} radius={20} />
          </View>
        ) : (
          <MessageState
            tone="error"
            icon="alert-circle-outline"
            title="Asset unavailable"
            body="We couldn't find this asset in any bag."
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.ds.canvas },
  flex: { flex: 1 },
  bold: { fontWeight: "600" },
  tabular: { fontVariant: ["tabular-nums"] },
  pressed: { opacity: 0.6 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.density.gutter + 4,
    paddingBottom: 8,
  },
  headerSide: { width: 64 },
  closeButton: { alignItems: "flex-end" },
  headerTitle: { flex: 1, textAlign: "center" },
  content: {
    paddingHorizontal: theme.density.gutter + 4,
    paddingTop: 16,
    gap: 32,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 20 },
  name: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: theme.ds.ink,
  },
  symbolRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  balanceBuy: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  group: { gap: 6 },
  balanceRow: { flexDirection: "row", alignItems: "baseline" },
  balanceNumber: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "800",
    letterSpacing: -1,
    color: theme.ds.ink,
    fontVariant: ["tabular-nums"],
  },
  balanceSymbol: { fontSize: 28, fontWeight: "700", color: theme.ds.inkTertiary },
  buyWrap: { alignItems: "center", gap: 4, maxWidth: 110 },
  buyButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.ink,
  },
  price: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "800",
    letterSpacing: -1,
    color: theme.ds.ink,
    fontVariant: ["tabular-nums"],
  },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chart: { marginTop: 12 },
  chartSkeleton: { marginHorizontal: -(theme.density.gutter + 4), marginTop: 12, opacity: 0.6 },
  fact: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  loading: { gap: 16, alignItems: "flex-start" },
}));
