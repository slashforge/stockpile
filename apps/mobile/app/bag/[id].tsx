import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useAssetColors } from "@/components/stockpile/allocation";
import { bagTheme } from "@/components/stockpile/bag-art";
import {
  bagTradable,
  researchOnlyReason,
  TradeStatus,
} from "@/components/stockpile/bag-card";
import {
  Collapsible,
  Divider,
  MessageState,
  Screen,
  Skeleton,
} from "@/components/stockpile/layout";
import {
  PriceChart,
  RangeChips,
  useChartColor,
} from "@/components/stockpile/price-chart";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { SaveButton } from "@/components/stockpile/save-button";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { FullText, T } from "@/components/stockpile/type";
import { useOpenBuy } from "@/hooks/use-open-buy";
import { useOpenSell } from "@/hooks/use-open-sell";
import { useBagPosition } from "@/hooks/use-positions";
import { useBag } from "@/hooks/use-bags";
import { useBagChart } from "@/hooks/use-charts";
import { collectStories, useBagStories } from "@/hooks/use-feed";
import { connectionFor, type Story } from "@/services/api/feed";
import { formatStoryDate } from "@/components/stockpile/story-reel";
import { useStockpileAuth } from "@/providers/auth-context";
import {
  bagCurator,
  bagMarket,
  changeTone,
  formatAsOf,
  formatImpactPct,
  formatSignedPct,
  formatUsdCompact,
} from "@/lib/market";
import { formatHoldingAmount, formatUsdValue } from "@/lib/portfolio";
import type { BagPosition } from "@/services/api/positions";
import {
  type BagChart,
  type ChartPoint,
  type ChartRange,
  isDrawable,
} from "@/services/api/charts";
import type { Bag } from "@/services/api/types";
import { density } from "@/config/sizing";
import { formatBps } from "@/utils/amounts";
import { HapticPressable } from "@/components/stockpile/haptic-pressable";

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function openLink(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}

function categoryLabel(bag: Bag) {
  const issuer = bag.issuer === "prestocks" ? "PreStocks" : "xStocks";
  return bag.assetClass === "pre-ipo" ? `${issuer} · Pre-IPO` : issuer;
}

function pctBetween(from: number, to: number) {
  return from > 0 ? ((to - from) / from) * 100 : null;
}

function useToneColor(pct: number | null | undefined) {
  const { theme } = useUnistyles();
  const tone = changeTone(pct);
  if (tone === "up") return theme.ds.positive;
  if (tone === "down") return theme.ds.danger;
  return theme.ds.inkTertiary;
}

function Hero({ bag }: { bag: Bag }) {
  const { theme } = useUnistyles();
  const { icon, gradient } = bagTheme(bag);
  const curator = bagCurator(bag);
  return (
    <View style={styles.hero}>
      <View style={styles.heroRow}>
        <LinearGradient
          colors={theme.gradients[gradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroIcon}
        >
          <Ionicons name={icon} size={34} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.flex}>
          <T
            variant="title1"
            accessibilityRole="header"
            numberOfLines={2}
            style={styles.heroTitle}
          >
            {bag.title}
          </T>
          <View style={styles.pills}>
            <View style={styles.category}>
              <T variant="caption" style={styles.categoryLabel}>
                {categoryLabel(bag)}
              </T>
            </View>
            <TradeStatus bag={bag} />
          </View>
        </View>
      </View>
      <T variant="callout" tone="secondary" numberOfLines={2}>
        {bag.subtitle}
      </T>
      {curator ? (
        <T variant="footnote" tone="tertiary" numberOfLines={1}>
          Tracks {curator.name}
        </T>
      ) : null}
    </View>
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
  const first = drawable ? points[0] : null;
  const last = drawable ? points[points.length - 1] : null;
  const rangePct =
    chart?.changePct ?? (first && last ? pctBetween(first.value, last.value) : null);
  const market = bagMarket(bag);
  // Without a series, fall back to the 24h figure the bag already carries.
  const fallback24h = !drawable && rangePct == null;
  const shownPct = scrub && first
    ? pctBetween(first.value, scrub.value)
    : fallback24h
      ? (market?.change24hPct ?? null)
      : rangePct;
  const color = useChartColor(rangePct ?? (fallback24h ? market?.change24hPct : null));
  const headColor = useToneColor(shownPct);
  const caption = scrub
    ? formatPointDate(scrub.timestamp, range)
    : fallback24h
      ? "24h"
      : RANGE_WORD[range];
  // Keep the chips while any range has been drawable so the user can switch back.
  const [everDrawn, setEverDrawn] = useState(false);
  if (drawable && !everDrawn) setEverDrawn(true);

  return (
    <View style={styles.performance}>
      <View style={styles.headline}>
        <T variant="footnote" tone="tertiary" style={styles.bold}>
          Bag index
        </T>
        {shownPct == null ? (
          <T style={[styles.bigNumber, styles.bigMuted]}>—</T>
        ) : (
          <T
            style={[styles.bigNumber, { color: headColor }]}
            accessibilityLabel={`${formatSignedPct(shownPct, 2)} ${caption}`}
          >
            {formatSignedPct(shownPct, 2)}
          </T>
        )}
        <View style={styles.headlineMeta}>
          <T variant="subhead" tone="secondary">
            {caption}
          </T>
          {holdingUsd != null ? (
            <>
              <View style={styles.metaDot} />
              <T variant="subhead" tone="secondary" style={styles.tabular}>
                You hold {formatUsdValue(holdingUsd)}
              </T>
            </>
          ) : null}
        </View>
      </View>

      {drawable ? (
        <PriceChart
          points={points}
          color={color}
          range={range}
          height={220}
          bleed={density.gutter}
          onScrub={setScrub}
          accessibilityLabel={`Bag index chart, ${RANGE_WORD[range]}, ${formatSignedPct(rangePct, 2)}`}
        />
      ) : loading && !everDrawn ? (
        <View style={styles.chartPlaceholder}>
          <Skeleton height={220} radius={0} />
        </View>
      ) : (
        <T variant="caption" tone="tertiary" style={styles.soon}>
          Chart coming soon
        </T>
      )}

      {drawable || everDrawn ? (
        <RangeChips value={range} onChange={onRange} color={color} busy={loading} />
      ) : null}
    </View>
  );
}

function Holdings({ bag, chart }: { bag: Bag; chart: BagChart | undefined }) {
  const colors = useAssetColors(bag.assets);
  const legs = useMemo(
    () =>
      new Map(
        (chart?.legs ?? [])
          .filter((leg) => leg.mint && leg.changePct != null)
          .map((leg) => [leg.mint, leg]),
      ),
    [chart?.legs],
  );
  // Range change only when every leg has its own series; otherwise the 24h figures, consistently.
  const hasLegs = legs.size > 0 && legs.size === bag.assets.length;
  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <T variant="title3" accessibilityRole="header">
          Holdings
        </T>
        <T variant="footnote" tone="tertiary">
          {bag.assets.length} assets · {hasLegs ? "range" : "24h"} change
        </T>
      </View>
      <View style={styles.weights}>
        {bag.assets.map((asset, index) => (
          <View
            key={`${asset.symbol}-${index}`}
            style={{ flex: asset.weightBps, backgroundColor: colors[index] }}
          />
        ))}
      </View>
      {bag.assets.map((asset, index) => {
        const leg = asset.mint ? legs.get(asset.mint) : undefined;
        const pct = hasLegs
          ? (leg?.changePct ?? null)
          : (asset.market?.priceChange24hPct ?? null);
        return (
          <View key={`${asset.symbol}-${index}`}>
            {index > 0 ? <Divider inset={52 + density.rowGap} /> : null}
            <HoldingRow
              bagId={bag.id}
              symbol={asset.symbol}
              name={asset.name}
              iconUrl={asset.iconUrl}
              verified={!!asset.mint}
              weight={formatBps(asset.weightBps)}
              pct={pct}
            />
          </View>
        );
      })}
    </View>
  );
}

function HoldingRow({
  bagId,
  symbol,
  name,
  iconUrl,
  verified,
  weight,
  pct,
}: {
  bagId: string;
  symbol: string;
  name: string;
  iconUrl: string | null;
  verified: boolean;
  weight: string;
  pct: number | null;
}) {
  const color = useToneColor(pct);
  return (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel={`${symbol}, ${name}, ${weight} of the bag${pct != null ? `, ${formatSignedPct(pct)}` : ""}${verified ? "" : ". Token mint not yet verified"}`}
      accessibilityHint="Opens the asset"
      onPress={() =>
        router.push({
          pathname: "/asset/[symbol]",
          params: { symbol, bag: bagId },
        })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <TokenAvatar symbol={symbol} iconUrl={iconUrl} size={52} />
      <View style={styles.flex}>
        <T variant="headline" numberOfLines={1}>
          {symbol}
        </T>
        <T
          variant="footnote"
          tone={verified ? "secondary" : "caution"}
          numberOfLines={1}
        >
          {verified ? name : `${name} · mint unverified`}
        </T>
      </View>
      <View style={styles.rowRight}>
        <T variant="headline" style={styles.tabular}>
          {weight}
        </T>
        <T variant="footnote" style={[styles.tabular, styles.bold, { color }]}>
          {formatSignedPct(pct)}
        </T>
      </View>
    </HapticPressable>
  );
}

function Facts({ bag }: { bag: Bag }) {
  const market = bagMarket(bag);
  const asOf = formatAsOf(market?.asOf);
  const rows: [string, string][] = [];
  if (market?.premiumPct != null)
    rows.push(["Token vs stock", formatSignedPct(market.premiumPct)]);
  if (market?.worstImpactSymbol && market.worstImpactPct != null)
    rows.push([
      "Thinnest route",
      `${market.worstImpactSymbol} · ${formatImpactPct(market.worstImpactPct)} @ $10`,
    ]);
  if (market?.worstLiquidityUsd != null)
    rows.push([
      "Smallest pool",
      `${market.worstLiquiditySymbol ? `${market.worstLiquiditySymbol} · ` : ""}${formatUsdCompact(market.worstLiquidityUsd)}`,
    ]);
  rows.push([
    "Sources",
    `${bag.sources.length} ${bag.sources.length === 1 ? "source" : "sources"}`,
  ]);
  return (
    <View style={styles.block}>
      <T variant="title3" accessibilityRole="header">
        Market
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
      </View>
      {asOf ? (
        <T variant="caption" tone="tertiary">
          Market data {asOf}. Not a quote.
        </T>
      ) : null}
    </View>
  );
}

/** What the signed-in user holds of this bag, token by token. Bag tokens only show here, not in Portfolio. */
function YourTokens({ position, bag }: { position: BagPosition; bag: Bag }) {
  const pnl = changeTone(position.pnlPct);
  const pnlTone = pnl === "up" ? "positive" : pnl === "down" ? "danger" : "secondary";
  const legs = position.legs.filter((leg) => leg.held !== "0");
  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <T variant="title3" accessibilityRole="header">
          Your tokens
        </T>
        <T variant="footnote" tone={pnlTone} style={styles.tabular}>
          {formatUsdValue(position.valueUsd)}
          {position.pnlPct != null ? ` · ${formatSignedPct(position.pnlPct)}` : ""}
        </T>
      </View>
      {legs.map((leg, index) => {
        const asset = bag.assets.find((candidate) => candidate.mint === leg.mint);
        const amount = `${formatHoldingAmount(String(leg.heldUi))} ${leg.symbol}`;
        return (
          <View key={leg.mint}>
            {index > 0 ? <Divider inset={40 + density.rowGap} /> : null}
            <View
              style={styles.row}
              accessible
              accessibilityLabel={`${leg.symbol}. ${formatUsdValue(leg.usdValue)}, ${amount}`}
            >
              <TokenAvatar symbol={leg.symbol} mint={leg.mint} iconUrl={leg.iconUrl ?? asset?.iconUrl ?? null} size={40} />
              <View style={styles.flex}>
                <T variant="headline" numberOfLines={1}>
                  {leg.symbol}
                </T>
                <T variant="footnote" tone="secondary" style={styles.tabular} numberOfLines={1}>
                  {amount}
                </T>
              </View>
              <T variant="headline" style={styles.tabular}>
                {formatUsdValue(leg.usdValue)}
              </T>
            </View>
          </View>
        );
      })}
      {!position.reconciled ? (
        <T variant="caption" tone="caution">
          Some of this bag’s tokens moved out of your wallet, so it shows what’s still there.
        </T>
      ) : null}
    </View>
  );
}

const STANCE = {
  supporting: { label: "Supports", icon: "trending-up" },
  opposing: { label: "Challenges", icon: "trending-down" },
  neutral: { label: "Context", icon: "information-circle" },
} as const;

function StoryRow({ story, bagId }: { story: Story; bagId: string }) {
  const { theme } = useUnistyles();
  const connection = connectionFor(story, bagId);
  const stance = connection ? STANCE[connection.context] : null;
  const date = formatStoryDate(story.publishedAt);
  const fg =
    connection?.context === "supporting"
      ? theme.ds.positive
      : connection?.context === "opposing"
        ? theme.ds.danger
        : theme.ds.inkSecondary;
  const bg =
    connection?.context === "supporting"
      ? theme.ds.mintSoft
      : connection?.context === "opposing"
        ? theme.ds.coralSoft
        : theme.ds.sunken;
  return (
    <HapticPressable
      accessibilityRole="link"
      accessibilityLabel={`${stance ? `${stance.label}: ` : ""}${story.title}. ${story.publisher}${date ? `, ${date}` : ""}`}
      onPress={() => openLink(story.sourceUrl)}
      style={({ pressed }) => [styles.story, pressed && styles.pressed]}
    >
      {stance ? (
        <View style={[styles.stance, { backgroundColor: bg }]}>
          <Ionicons name={stance.icon} size={12} color={fg} />
          <T variant="caption" style={[styles.bold, { color: fg }]}>
            {stance.label}
          </T>
        </View>
      ) : null}
      <T variant="callout" style={styles.bold} numberOfLines={3}>
        {story.title}
      </T>
      {connection?.explanation ? (
        <T variant="footnote" tone="secondary" numberOfLines={3}>
          {connection.explanation}
        </T>
      ) : null}
      <T variant="caption" tone="tertiary">
        {story.publisher}
        {date ? ` · ${date}` : ""} · {hostOf(story.sourceUrl)}
        {story.format === "podcast" ? " · Podcast" : ""}
        {story.provenance === "ai" ? " · AI summary" : ""}
      </T>
    </HapticPressable>
  );
}

function RelatedStories({ bagId }: { bagId: string }) {
  const stories = useBagStories(bagId);
  if (stories.isPending) return <Skeleton height={64} radius={18} />;
  const result = collectStories(stories.data?.pages);
  const list = result.status === "live" ? result.stories : [];
  const count = (context: "supporting" | "opposing") =>
    list.filter((story) => connectionFor(story, bagId)?.context === context)
      .length;
  const summary = stories.isError
    ? "Couldn't load stories"
    : result.status === "unavailable"
      ? result.message
      : list.length === 0
        ? "No related stories yet"
        : `${count("supporting")} supporting · ${count("opposing")} challenging`;
  return (
    <Collapsible
      title="Stories"
      icon="newspaper"
      tint="coral"
      count={list.length || undefined}
      summary={summary}
    >
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
              onPress={() => stories.fetchNextPage()}
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
    <View style={styles.skeleton} accessibilityLabel="Loading bag">
      <View style={styles.heroRow}>
        <Skeleton height={80} width={80} radius={26} />
        <View style={[styles.flex, styles.skeletonText]}>
          <Skeleton height={28} width="80%" />
          <Skeleton height={16} width="40%" />
        </View>
      </View>
      <Skeleton height={44} width="45%" />
      <Skeleton height={220} radius={20} />
    </View>
  );
}

export default function BagScreen() {
  const { id, buy } = useLocalSearchParams<{ id: string; buy?: string }>();
  const bag = useBag(id);
  const [range, setRange] = useState<ChartRange>("1M");
  const chart = useBagChart(id, range);
  const auth = useStockpileAuth();
  const { theme } = useUnistyles();
  const openBuy = useOpenBuy();
  const openSell = useOpenSell();
  const { position } = useBagPosition(id);

  // Refetch whenever the screen regains focus (mount already fetches: staleTime is 0).
  const focusedOnce = useRef(false);
  const refetchBag = bag.refetch;
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      refetchBag();
    }, [refetchBag]),
  );

  // `stockpile://bag/<id>?buy=1` opens "Put money in the bag" once the bag has loaded.
  const autoBuyDone = useRef(false);
  const loaded = !!bag.data;
  useEffect(() => {
    if (buy !== "1" || !loaded || !id || autoBuyDone.current) return;
    autoBuyDone.current = true;
    // Not cancelled on cleanup: clearing the param below re-runs this effect.
    setTimeout(() => {
      openBuy(id);
      // Consume the param so a remount/reload of this screen doesn't reopen the sheet.
      router.setParams({ buy: undefined });
    }, 400);
  }, [buy, loaded, id, openBuy]);

  if (!bag.data) {
    return (
      <Screen back>
        {bag.isError ? (
          <MessageState
            tone="error"
            icon="alert-circle-outline"
            title="Bag unavailable"
            body={bag.error.message}
            actionLabel="Try again"
            onAction={() => bag.refetch()}
          />
        ) : (
          <DetailSkeleton />
        )}
      </Screen>
    );
  }

  const data = bag.data;
  const tradable = bagTradable(data);
  // Only what this bag's position holds; tokens outside it show as loose holdings in Portfolio.
  const holdingUsd = position?.valueUsd ?? null;
  const heldChange = changeTone(position?.pnlPct);
  const heldTone = heldChange === "up" ? "positive" : heldChange === "down" ? "danger" : "secondary";

  // Signed-out users go through the sign-in sheet and land in the buy sheet afterwards.
  const tradeCta = () => openBuy(data.id);

  return (
    <Screen
      back
      right={<SaveButton bagId={data.id} title={data.title} variant="circle" />}
      onRefresh={() => Promise.all([bag.refetch(), chart.refetch()])}
      footer={
        auth.configured ? (
          <>
            {!tradable ? (
              <View style={styles.footerNote}>
                <Ionicons
                  name="lock-closed"
                  size={13}
                  color={theme.ds.inkSecondary}
                />
                <T variant="footnote" tone="secondary" style={styles.flex}>
                  {researchOnlyReason(data)}
                </T>
              </View>
            ) : null}
            {position ? (
              <View
                style={styles.heldBanner}
                accessible
                accessibilityLabel={`You hold about ${formatUsdValue(position.valueUsd)}, ${formatSignedPct(position.pnlPct)} since buy`}
              >
                <Ionicons name="layers" size={14} color={theme.ds.accent} />
                <T variant="footnote" style={[styles.flex, styles.tabular]} numberOfLines={1}>
                  You hold ≈ {formatUsdValue(position.valueUsd)}
                  {position.pnlPct != null ? (
                    <T variant="footnote" tone={heldTone}>
                      {" "}· {formatSignedPct(position.pnlPct)} since buy
                    </T>
                  ) : null}
                </T>
              </View>
            ) : null}
            {position && auth.authenticated ? (
              <View style={styles.tradeRow}>
                {position.sellable ? (
                  <View style={styles.flex}>
                    <PrimaryButton label="Sell" variant="outline" onPress={() => openSell(data.id)} />
                  </View>
                ) : null}
                {tradable ? (
                  <View style={styles.flex}>
                    <PrimaryButton label="Buy more" icon="add-circle" onPress={tradeCta} />
                  </View>
                ) : null}
              </View>
            ) : null}
            {/* Research-only bags can't be bought, so never invite a sign-in "to buy" them. */}
            {tradable && !(position && auth.authenticated) ? (
              <PrimaryButton
                label={
                  auth.authenticated ? "Put money in the bag" : "Sign in to buy"
                }
                icon={auth.authenticated ? "add-circle" : "mail"}
                onPress={tradeCta}
                accessibilityHint="Get a quote and review each transaction before signing"
              />
            ) : null}
          </>
        ) : undefined
      }
    >
      <Hero bag={data} />

      <Performance
        bag={data}
        chart={chart.isError ? undefined : chart.data}
        range={range}
        onRange={setRange}
        loading={chart.isFetching}
        holdingUsd={holdingUsd}
      />

      {position ? <YourTokens position={position} bag={data} /> : null}

      <Holdings bag={data} chart={chart.isError ? undefined : chart.data} />

      <Facts bag={data} />

      <View style={styles.sections}>
        <Collapsible
          title="Why this bag"
          icon="bulb"
          tint="accent"
          summary={data.thesis}
        >
          <FullText variant="callout">{data.thesis}</FullText>
          {data.description ? (
            <FullText variant="footnote" tone="secondary">
              {data.description}
            </FullText>
          ) : null}
        </Collapsible>

        <RelatedStories bagId={data.id} />

        <Collapsible
          title="Evidence"
          icon="document-text"
          tint="tertiary"
          count={data.sources.length}
          defaultOpen={bagCurator(data) != null && data.sources.length > 0}
          summary={
            data.sources.length
              ? data.sources.map((s) => hostOf(s.url)).join(" · ")
              : "No sources attached yet"
          }
        >
          {data.sources.map((source) => (
            <HapticPressable
              key={source.url}
              accessibilityRole="link"
              accessibilityLabel={`Open source: ${source.title}`}
              onPress={() => openLink(source.url)}
              style={({ pressed }) => [
                styles.source,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.flex}>
                <T variant="callout" style={styles.bold} numberOfLines={3}>
                  {source.title}
                </T>
                <T variant="footnote" tone="secondary">
                  {hostOf(source.url)}
                </T>
              </View>
              <Ionicons name="open-outline" size={16} color={theme.ds.accent} />
            </HapticPressable>
          ))}
        </Collapsible>

        <Collapsible
          title="Risks & disclosure"
          icon="shield-checkmark"
          tint="caution"
          summary={data.disclosure}
        >
          <FullText variant="callout">{data.disclosure}</FullText>
          {(data.risks.length > 0 ? data.risks : GENERAL_RISKS).map((risk) => (
            <View key={risk} style={styles.riskItem}>
              <View style={styles.riskBullet} />
              <FullText
                variant="footnote"
                tone="secondary"
                containerStyle={styles.flex}
              >
                {risk}
              </FullText>
            </View>
          ))}
        </Collapsible>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  bold: { fontWeight: "600" },
  tabular: { fontVariant: ["tabular-nums"] },
  pressed: { opacity: 0.6 },
  hero: { gap: 10, marginTop: 4 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  heroIcon: {
    width: 80,
    height: 80,
    ...theme.rounded(26),
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 30, lineHeight: 34 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  category: {
    paddingHorizontal: theme.density.chipX,
    paddingVertical: theme.density.chipY,
    borderRadius: theme.radius.full,
    backgroundColor: theme.ds.accentSoft,
  },
  categoryLabel: { fontWeight: "700", color: theme.ds.accent },
  performance: { gap: 12, marginTop: 20 },
  headline: { gap: 2 },
  bigNumber: {
    fontSize: 46,
    lineHeight: 52,
    fontWeight: "800",
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"],
  },
  bigMuted: { color: theme.ds.inkTertiary },
  headlineMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.ds.inkTertiary,
  },
  chartPlaceholder: { marginHorizontal: -theme.density.gutter, opacity: 0.6 },
  soon: { marginTop: -4 },
  block: { gap: 12, marginTop: 28 },
  blockHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  weights: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.density.rowGap,
    paddingVertical: 12,
  },
  rowRight: { alignItems: "flex-end", gap: 2 },
  fact: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  sections: { gap: theme.density.item, marginTop: 28 },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.density.rowGap,
    padding: 10,
    ...theme.rounded(14),
    backgroundColor: theme.ds.canvas,
  },
  story: {
    gap: 6,
    padding: 10,
    ...theme.rounded(14),
    backgroundColor: theme.ds.canvas,
  },
  stance: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.density.chipX,
    paddingVertical: theme.density.chipY,
    borderRadius: 999,
  },
  riskItem: {
    flexDirection: "row",
    gap: theme.density.item,
    alignItems: "flex-start",
  },
  riskBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.ds.caution,
    marginTop: 7,
  },
  heldBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: theme.ds.accentSoft,
  },
  tradeRow: { flexDirection: "row", gap: theme.density.item },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  skeleton: { gap: theme.density.stack, marginTop: 4 },
  skeletonText: { gap: 8 },
}));
