import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  type AssetMarket,
  type BagMarket,
  type Change24hSource,
  changeTone,
  type Curator,
  type DisclosureEvidence,
  EM_DASH,
  evidenceLine,
  formatAsOf,
  formatImpactPct,
  formatPrice,
  formatSignedPct,
  formatUsdCompact,
  type LiquidityTier,
  LOW_COVERAGE,
  underlyingCaption,
} from "@/lib/market";
import { pickCardReturns } from "@/lib/returns";
import type { BagReturnEntry } from "@/services/api/returns";
import { T } from "./type";

const TONE_ICON = {
  up: "caret-up",
  down: "caret-down",
  flat: "remove",
} as const;

/** Compact "24h ▲ +1.8%". Hidden when there is no change; muted when bag coverage is low. */
export function ChangeBadge({
  pct,
  coverage,
  onArt = false,
  label = "24h",
  source,
}: {
  pct: number | null | undefined;
  coverage?: number | null;
  onArt?: boolean;
  label?: string;
  /** "jupiter" = Jupiter's own 24h figure (approximate): shown muted with a "~". */
  source?: Change24hSource | null;
}) {
  const { theme } = useUnistyles();
  const tone = changeTone(pct);
  if (!tone) return null;
  const approx = source === "jupiter";
  const partial = coverage != null && coverage < LOW_COVERAGE;
  const muted = partial || approx;
  const color = onArt
    ? "#FFFFFF"
    : muted || tone === "flat"
      ? theme.ds.inkTertiary
      : tone === "up"
        ? theme.ds.positive
        : theme.ds.danger;
  return (
    <View
      style={[styles.badge, onArt && styles.badgeOnArt, muted && styles.muted]}
      accessibilityLabel={`${label} change ${approx ? "about " : ""}${formatSignedPct(pct)}${partial ? ", partial data" : ""}${approx ? ", per Jupiter" : ""}`}
    >
      <T variant="caption" style={[styles.badgeLabel, { color }]}>
        {label}
      </T>
      <Ionicons name={TONE_ICON[tone]} size={10} color={color} />
      <T variant="caption" style={[styles.badgeValue, { color }]}>
        {approx ? "~" : ""}
        {formatSignedPct(pct)}
      </T>
    </View>
  );
}

function StripCell({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption?: string | null;
  tone?: string;
}) {
  return (
    <View style={styles.cell}>
      <T variant="caption" tone="tertiary" numberOfLines={1}>
        {label}
      </T>
      <T
        variant="headline"
        numberOfLines={1}
        style={[styles.tabular, tone ? { color: tone } : null]}
      >
        {value}
      </T>
      {caption ? (
        <T variant="caption" tone="tertiary" numberOfLines={1}>
          {caption}
        </T>
      ) : null}
    </View>
  );
}

/** Bag detail stats: 24h change, token premium vs the stock, and the thinnest route ($10 impact). */
export function MarketStrip({ market }: { market: BagMarket | null }) {
  const { theme } = useUnistyles();
  if (!market) return null;
  const tone = changeTone(market.change24hPct);
  const lowCoverage = market.coverage != null && market.coverage < LOW_COVERAGE;
  const approx = market.change24hSource === "jupiter";
  const changeColor =
    lowCoverage || approx || !tone || tone === "flat"
      ? undefined
      : tone === "up"
        ? theme.ds.positive
        : theme.ds.danger;
  const asOf = formatAsOf(market.asOf);
  const hasImpact = market.worstImpactPct != null && !!market.worstImpactSymbol;
  const tvl =
    market.worstLiquidityUsd != null
      ? `${market.worstLiquiditySymbol ? `${market.worstLiquiditySymbol} ` : ""}${formatUsdCompact(market.worstLiquidityUsd)} pool`
      : null;
  return (
    <View style={styles.stripWrap}>
      <View style={styles.strip}>
        <StripCell
          label="24h"
          value={`${approx && market.change24hPct != null ? "~" : ""}${formatSignedPct(market.change24hPct)}`}
          tone={changeColor}
          caption={
            lowCoverage
              ? `${Math.round((market.coverage ?? 0) * 100)}% of bag priced`
              : approx
                ? "24h per Jupiter"
                : null
          }
        />
        <View style={styles.stripDivider} />
        <StripCell
          label="Token vs stock"
          value={formatSignedPct(market.premiumPct)}
        />
        <View style={styles.stripDivider} />
        {hasImpact ? (
          <View
            style={styles.cell}
            accessible
            accessibilityLabel={`Thinnest: ${market.worstImpactSymbol} ${formatImpactPct(market.worstImpactPct)} impact at $10${tvl ? `. ${tvl}` : ""}`}
          >
            <T variant="caption" tone="tertiary" numberOfLines={1}>
              Thinnest
            </T>
            <T variant="headline" numberOfLines={1} style={styles.tabular}>
              {market.worstImpactSymbol}
            </T>
            <T variant="caption" tone="secondary" numberOfLines={1} style={styles.tabular}>
              {formatImpactPct(market.worstImpactPct)} impact @ $10
            </T>
            {tvl ? (
              <T
                variant="caption"
                tone="tertiary"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={[styles.tabular, styles.muted]}
              >
                {tvl}
              </T>
            ) : null}
          </View>
        ) : (
          <StripCell
            label="Thinnest liquidity"
            value={formatUsdCompact(market.worstLiquidityUsd)}
            caption={market.worstLiquiditySymbol}
          />
        )}
      </View>
      {asOf ? (
        <T variant="caption" tone="tertiary" align="center">
          Market data {asOf}. Not a quote.
        </T>
      ) : null}
    </View>
  );
}

const TIER_TONE = { deep: "positive", ok: "neutral", thin: "caution" } as const;

export function LiquidityPill({ tier }: { tier: LiquidityTier | null }) {
  if (!tier) return null;
  pillStyles.useVariants({ tone: TIER_TONE[tier] });
  return (
    <View style={pillStyles.pill} accessibilityLabel={`${tier} liquidity`}>
      <T variant="caption" style={pillStyles.label}>
        {tier === "ok"
          ? "OK liquidity"
          : `${tier[0].toUpperCase()}${tier.slice(1)}`}
      </T>
    </View>
  );
}

/** Per-asset market line: price, 24h, liquidity tier, premium and the stock-price freshness. */
export function AssetMarketLine({
  market,
  liquidityTier,
}: {
  market: AssetMarket | null;
  liquidityTier: LiquidityTier | null;
}) {
  if (!market)
    return liquidityTier ? <LiquidityPill tier={liquidityTier} /> : null;
  const reference = underlyingCaption(market.underlying);
  const premiumLabel =
    market.underlying?.source === "prestocks" ? "vs issuer mark" : "vs stock";
  return (
    <View style={styles.assetMarket}>
      <View style={styles.assetMarketRow}>
        <T variant="footnote" style={[styles.bold, styles.tabular]}>
          {formatPrice(market.usdPrice)}
        </T>
        <ChangeBadge
          pct={market.priceChange24hPct}
          source={market.change24hSource}
        />
        <LiquidityPill tier={liquidityTier} />
        {market.probe ? (
          <T
            variant="caption"
            tone="tertiary"
            style={styles.tabular}
            accessibilityLabel={`About ${formatImpactPct(market.probe.priceImpactPct)} price impact at $${market.probe.sizeUsdc}`}
          >
            ~{formatImpactPct(market.probe.priceImpactPct)} impact
          </T>
        ) : null}
        {market.premiumPct != null ? (
          <T variant="caption" tone="tertiary" style={styles.tabular}>
            {premiumLabel} {formatSignedPct(market.premiumPct)}
          </T>
        ) : null}
      </View>
      {reference ? (
        <T variant="caption" tone="tertiary" numberOfLines={1}>
          {reference}
        </T>
      ) : null}
      {market.change24hSource === "jupiter" && market.priceChange24hPct != null ? (
        <T variant="caption" tone="tertiary" numberOfLines={1}>
          24h per Jupiter
        </T>
      ) : null}
    </View>
  );
}

export function EvidenceList({ items }: { items: DisclosureEvidence[] }) {
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <View style={styles.evidence}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        hitSlop={6}
        style={styles.evidenceToggle}
      >
        <Ionicons
          name="document-text-outline"
          size={13}
          color={theme.ds.accent}
        />
        <T variant="caption" tone="accent" style={styles.bold}>
          {items.length === 1 ? "1 filing" : `${items.length} filings`}
        </T>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={12}
          color={theme.ds.accent}
        />
      </Pressable>
      {open
        ? items.map((item, index) => (
            <View
              key={`${item.member}-${item.txnDate ?? index}-${index}`}
              style={styles.evidenceItem}
            >
              <T variant="caption" tone="secondary" style={styles.shrink}>
                {evidenceLine(item)}
              </T>
              {item.url ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`View filing: ${evidenceLine(item)}`}
                  hitSlop={8}
                  onPress={() => WebBrowser.openBrowserAsync(item.url!)}
                >
                  <T variant="caption" tone="accent" style={styles.bold}>
                    View filing
                  </T>
                </Pressable>
              ) : null}
            </View>
          ))
        : null}
    </View>
  );
}

export function CuratorLine({
  curator,
  onArt = false,
}: {
  curator: Curator | null;
  onArt?: boolean;
}) {
  if (!curator) return null;
  return (
    <T
      variant="caption"
      numberOfLines={1}
      style={[styles.curatorLine, onArt ? styles.onArt : undefined]}
      tone={onArt ? undefined : "tertiary"}
    >
      Tracking {curator.name}
    </T>
  );
}

const CURATOR_ICON = {
  person: "person-circle",
  aggregate: "people-circle",
  editorial: "sparkles",
} as const;

export function CuratorHeader({ curator }: { curator: Curator | null }) {
  const { theme } = useUnistyles();
  if (!curator) return null;
  return (
    <View style={styles.curator}>
      <Ionicons
        name={CURATOR_ICON[curator.kind] ?? "person-circle"}
        size={28}
        color={theme.ds.tertiary}
      />
      <View style={styles.shrink}>
        <T variant="subhead" style={styles.bold}>
          Tracks {curator.name}
        </T>
        {curator.description ? (
          <T variant="footnote" tone="secondary">
            {curator.description}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** Fewer points than this reads as a flat/stepped line rather than a trend. */
export const SPARKLINE_MIN_POINTS = 8;

/**
 * Card performance row: 1M (or since-listing) figure, a quieter 1Y/all-time line and the 1M
 * sparkline. "—" while loading; "No history yet" when there is nothing (or the fetch failed).
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
  /** Narrow rows (story footer): figures only, no sparkline. */
  compact?: boolean;
}) {
  const { theme } = useUnistyles();
  const picked = pickCardReturns(entry);
  if (!picked) {
    return (
      <View style={styles.returns}>
        <T
          variant="caption"
          tone={onArt ? undefined : "tertiary"}
          style={[styles.bold, onArt && styles.onArtMuted]}
        >
          {loading ? EM_DASH : "No history yet"}
        </T>
      </View>
    );
  }
  const { primary, secondary } = picked;
  const tone = changeTone(primary.pct) ?? "flat";
  const color =
    tone === "up"
      ? theme.ds.positive
      : tone === "down"
        ? theme.ds.danger
        : theme.ds.inkSecondary;
  const secondaryText = secondary
    ? secondary.label === "1Y"
      ? `${formatSignedPct(secondary.pct)} past year`
      : `${formatSignedPct(secondary.pct)} ${secondary.label}`
    : null;
  const primaryWord = primary.label === "1M" ? "past month" : primary.label;
  return (
    <View
      style={styles.returns}
      accessible
      accessibilityLabel={`${formatSignedPct(primary.pct)} ${primaryWord}${secondaryText ? `, ${secondaryText}` : ""}`}
    >
      <View style={[styles.returnPill, onArt && styles.returnPillOnArt]}>
        <Ionicons name={TONE_ICON[tone]} size={10} color={color} />
        <T variant="caption" style={[styles.badgeValue, { color }]}>
          {formatSignedPct(primary.pct)}
        </T>
        <T variant="caption" tone="tertiary" style={styles.badgeLabel}>
          {primary.label}
        </T>
      </View>
      {secondaryText ? (
        <T
          variant="caption"
          tone={onArt ? undefined : "tertiary"}
          numberOfLines={1}
          style={[styles.returnSecondary, onArt && styles.onArtMuted]}
        >
          {secondaryText}
        </T>
      ) : (
        <View style={styles.flexSpacer} />
      )}
      {entry && primary.label === "1M" && !compact ? (
        <Sparkline
          values={entry.sparkline}
          width={60}
          height={20}
          color={onArt ? "rgba(255,255,255,0.95)" : undefined}
        />
      ) : null}
    </View>
  );
}

/** Minimal line chart for list cards; renders nothing below `SPARKLINE_MIN_POINTS` finite points. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color,
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Overrides the up/down tone, e.g. white on artwork. */
  color?: string;
}) {
  const { theme } = useUnistyles();
  const points = values.filter(Number.isFinite);
  if (points.length < SPARKLINE_MIN_POINTS) return null;
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
  const up = points[points.length - 1] >= points[0];
  return (
    <Svg
      width={width}
      height={height}
      accessibilityLabel={up ? "Trend up" : "Trend down"}
    >
      <Polyline
        points={coords}
        fill="none"
        stroke={color ?? (up ? theme.ds.positive : theme.ds.danger)}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.ds.sunken,
  },
  badgeOnArt: { backgroundColor: "rgba(255,255,255,0.24)" },
  muted: { opacity: 0.7 },
  badgeLabel: { fontWeight: "600" },
  badgeValue: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  returns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 22,
  },
  returnPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.ds.sunken,
  },
  returnPillOnArt: { backgroundColor: theme.ds.surface },
  returnSecondary: {
    flex: 1,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  flexSpacer: { flex: 1 },
  onArtMuted: { color: "rgba(255,255,255,0.85)" },
  stripWrap: { gap: 6 },
  strip: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 10,
    paddingHorizontal: 4,
    ...theme.rounded(20),
    backgroundColor: theme.ds.surface,
    borderWidth: 1,
    borderColor: theme.ds.line,
  },
  stripDivider: { width: 1, backgroundColor: theme.ds.line },
  cell: { flex: 1, alignItems: "center", gap: 2, paddingHorizontal: 6 },
  tabular: { fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "600" },
  assetMarket: { gap: 2, marginTop: 4 },
  assetMarketRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  evidence: { gap: 6, marginTop: 6 },
  evidenceToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    minHeight: 28,
  },
  evidenceItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  shrink: { flexShrink: 1, flex: 1 },
  curatorLine: { flexShrink: 1 },
  onArt: { color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  curator: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.density.item,
    padding: 10,
    ...theme.rounded(18),
    backgroundColor: theme.ds.tertiarySoft,
  },
}));

const pillStyles = StyleSheet.create((theme) => ({
  pill: {
    paddingHorizontal: theme.density.chipX,
    paddingVertical: theme.density.chipY,
    borderRadius: theme.radius.full,
    variants: {
      tone: {
        positive: { backgroundColor: theme.ds.mintSoft },
        neutral: { backgroundColor: theme.ds.sunken },
        caution: { backgroundColor: theme.ds.cautionSoft },
      },
    },
  },
  label: {
    fontWeight: "600",
    variants: {
      tone: {
        positive: { color: theme.ds.positive },
        neutral: { color: theme.ds.inkSecondary },
        caution: { color: theme.ds.caution },
      },
    },
  },
}));
