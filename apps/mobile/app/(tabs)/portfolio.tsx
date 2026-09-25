import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AuthGate } from "@/components/stockpile/auth-gate";
import { GradientCard } from "@/components/stockpile/gradient-card";
import { useFundSheet } from "@/components/stockpile/fund-sheet";
import { HeroState } from "@/components/stockpile/hero-state";
import { CardSkeleton, Divider, Screen, Skeleton } from "@/components/stockpile/layout";
import { useHideTabBar } from "@/components/stockpile/tab-bar";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { UsdcLogo } from "@/components/stockpile/token-logos";
import { T } from "@/components/stockpile/type";
import { density } from "@/config/sizing";
import { useActivity, usePortfolio } from "@/hooks/use-account";
import { indexAssetsByMint, useBags } from "@/hooks/use-bags";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useLooseHoldings } from "@/hooks/use-loose-holdings";
import { useOpenSell } from "@/hooks/use-open-sell";
import { usePositions } from "@/hooks/use-positions";
import { changeTone, formatSignedPct } from "@/lib/market";
import { type BagPosition, heldPositions } from "@/services/api/positions";
import { LogoCluster } from "@/components/stockpile/bag-art";
import {
  activityVisual,
  describeActivity,
  flattenActivity,
  groupActivityByDay,
  formatHoldingAmount,
  formatUsdValue,
  relativeTime,
} from "@/lib/portfolio";
import { USDC_MINT } from "@/lib/solana/transaction";
import { solBalance, spendableUsdc } from "@/lib/trade/balance";
import { useStockpileAuth } from "@/providers/auth-context";
import type { Activity, Bag, Holding, Portfolio } from "@/services/api/types";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { formatMoney, formatTokenAmount, shortAddress } from "@/utils/amounts";
import { HapticPressable } from "@/components/stockpile/haptic-pressable";

/*
 * Layout system for this screen:
 * - Outer cards: rounded(24) continuous, clipped so pressed-row highlights keep the corners.
 * - Rows: one grid for every list row = [badge/avatar 40 | flexible text | right column]. Every
 *   row is exactly two text lines tall (title / subtitle on the left, value / amount on the right),
 *   vertically centred, so lists read as an even ledger. Bag membership and warnings are tiny
 *   inline chips on the title line, never a third line.
 * - Pills fully round, avatars/badges circles.
 * - Spacing comes from the shared `density` tokens (section header gap, section spacing, hero pad).
 */
const AVATAR = 40;
const ROW_H_PAD = density.card;
const ROW_GAP = density.rowGap;
const ROW_INSET = ROW_H_PAD + AVATAR + ROW_GAP;
const WALLET_PILL = 44;
const ACTIVITY_AVATAR = 44;
const SWAP_TOKEN = 30;
const ACTIVITY_BADGE = 18;
const ACTIVITY_RING = 2;

function formatAsOf(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Section with a 20/600 title and an optional small muted trailing caption on the same line. */
function PortfolioSection({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <T style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </T>
        {trailing ? (
          <T variant="caption" tone="tertiary" numberOfLines={1}>
            {trailing}
          </T>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Outer card for lists: clips pressed-row highlights to the card's corners. */
function ListCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.listCard}>
      <View style={styles.listClip}>{children}</View>
    </View>
  );
}

function Rows<Item>({
  items,
  keyOf,
  render,
}: {
  items: Item[];
  keyOf: (item: Item) => string;
  render: (item: Item) => React.ReactNode;
}) {
  return (
    <>
      {items.map((item, index) => (
        <View key={keyOf(item)}>
          {index > 0 ? <Divider inset={ROW_INSET} /> : null}
          {render(item)}
        </View>
      ))}
    </>
  );
}

/** Round icon badge used by hint, status and activity rows (same size as token avatars). */
function IconBadge({
  icon,
  color,
  background,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  background: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
  );
}

/** Small full-round chip under a row title (bag membership, low-fee warning). */
function RowChip({
  label,
  icon,
  tone = "accent",
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tone?: "accent" | "caution";
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { theme } = useUnistyles();
  const color = tone === "caution" ? theme.ds.caution : theme.ds.accent;
  const content = (
    <>
      <Ionicons name={icon} size={10} color={color} />
      <T variant="caption" tone={tone} numberOfLines={1} ellipsizeMode="tail" style={[styles.shrink, styles.chipText]}>
        {label}
      </T>
    </>
  );
  const chipStyle = [styles.chip, tone === "caution" ? styles.chipCaution : styles.chipAccent];
  if (!onPress) return <View style={chipStyle}>{content}</View>;
  return (
    <HapticPressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [...chipStyle, pressed && styles.pressed]}
    >
      {content}
    </HapticPressable>
  );
}

/** Compact status row for "unavailable" states, in the same grid as list rows. */
function StatusCard({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  const { theme } = useUnistyles();
  return (
    <ListCard>
      <View style={styles.row}>
        <IconBadge icon="cloud-offline-outline" color={theme.ds.inkSecondary} background={theme.ds.sunken} />
        <View style={styles.textCol}>
          <T variant="headline" numberOfLines={1}>
            {title}
          </T>
          <T variant="footnote" tone="secondary" numberOfLines={2}>
            {body}
          </T>
        </View>
        <HapticPressable
          accessibilityRole="button"
          accessibilityLabel={`${title}. Check again`}
          hitSlop={8}
          onPress={onRetry}
          style={({ pressed }) => [styles.rightInline, pressed && styles.pressed]}
        >
          <T variant="subhead" tone="accent">
            Retry
          </T>
        </HapticPressable>
      </View>
    </ListCard>
  );
}

/** One-row nudge shown when the wallet holds no bag tokens; keeps Activity above the fold. */
function NoBagTokensHint() {
  const { theme } = useUnistyles();
  return (
    <ListCard>
      <HapticPressable
        accessibilityRole="button"
        accessibilityLabel="No bag tokens yet. Browse bags"
        onPress={() => router.navigate("/bags")}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <IconBadge icon="layers" color={theme.ds.accent} background={theme.ds.accentSoft} />
        <View style={styles.textCol}>
          <T variant="headline" numberOfLines={1}>
            No bag tokens yet
          </T>
          <T variant="footnote" tone="secondary" numberOfLines={1}>
            Put money in a bag to see it here
          </T>
        </View>
        <View style={styles.rightInline}>
          <T variant="subhead" tone="accent">
            Browse
          </T>
          <Ionicons name="chevron-forward" size={16} color={theme.ds.accent} />
        </View>
      </HapticPressable>
    </ListCard>
  );
}

function PositionRow({ position, onSell }: { position: BagPosition; onSell: () => void }) {
  const tone = changeTone(position.pnlPct);
  const pnlTone = tone === "up" ? "positive" : tone === "down" ? "danger" : "secondary";
  const tokens = `${position.legs.length} ${position.legs.length === 1 ? "token" : "tokens"}`;
  const traded = relativeTime(position.lastTradedAt);
  return (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel={`${position.title}. ${formatUsdValue(position.valueUsd)}, ${formatSignedPct(position.pnlPct)} since buy`}
      accessibilityHint="Opens the bag"
      onPress={() => router.push(`/bag/${position.bagId}`)}
      style={({ pressed }) => [styles.row, styles.positionRow, pressed && styles.rowPressed]}
    >
      <View style={styles.cluster}>
        <LogoCluster assets={position.legs} size={26} limit={3} flat />
      </View>
      <View style={styles.textCol}>
        <T variant="headline" numberOfLines={1}>
          {position.title}
        </T>
        <T variant="footnote" tone="secondary" numberOfLines={1}>
          {traded ? `${tokens} · traded ${traded}` : tokens}
        </T>
        {!position.reconciled ? (
          <T variant="caption" tone="caution" numberOfLines={2}>
            Some tokens moved out of this wallet
          </T>
        ) : null}
      </View>
      <View style={styles.positionRight}>
        <T variant="numeric" style={styles.rightPrimary} numberOfLines={1}>
          {formatUsdValue(position.valueUsd)}
        </T>
        <T variant="footnote" tone={pnlTone} style={styles.tabular} numberOfLines={1}>
          {formatSignedPct(position.pnlPct)}
        </T>
      </View>
      {position.sellable ? (
        <HapticPressable
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={`Sell ${position.title}`}
          hitSlop={8}
          onPress={onSell}
          style={({ pressed }) => [styles.sellPill, pressed && styles.pressed]}
        >
          <T variant="subhead" tone="accent" style={styles.bold}>
            Sell
          </T>
        </HapticPressable>
      ) : null}
    </HapticPressable>
  );
}

/** Bags bought through the app, valued from what the wallet still holds. */
function PositionsSection() {
  const positions = usePositions();
  const openSell = useOpenSell();
  if (positions.isPending) return null;
  if (positions.isError || positions.data.status !== "live") {
    return (
      <PortfolioSection title="Your bags">
        <StatusCard
          title="Bag positions unavailable"
          body={
            positions.data?.message ??
            (positions.isError ? positions.error.message : "We couldn’t work out your bag positions right now.")
          }
          onRetry={() => positions.refetch()}
        />
      </PortfolioSection>
    );
  }
  const held = heldPositions(positions.data);
  if (held.length === 0) return null;
  return (
    <PortfolioSection title="Your bags">
      <ListCard>
        {held.map((position, index) => (
          <View key={position.bagId}>
            {index > 0 ? <Divider inset={ROW_H_PAD} /> : null}
            <PositionRow position={position} onSell={() => openSell(position.bagId)} />
          </View>
        ))}
      </ListCard>
    </PortfolioSection>
  );
}

function WalletCard({ address, portfolio }: { address: string; portfolio: Portfolio }) {
  const { theme } = useUnistyles();
  const { openFund } = useFundSheet();
  const { copied, copy } = useCopyFeedback();
  const usdc = spendableUsdc(portfolio);
  const live = portfolio.status === "live";
  const usdcLine =
    usdc.status === "known" ? `${formatMoney(usdc.raw.toString(), usdc.decimals)} USDC available` : usdc.reason;
  const unpriced = live && portfolio.unpricedCount > 0 ? ` · ${portfolio.unpricedCount} unpriced` : "";

  return (
    <GradientCard gradient="blue" decorated={false} style={styles.wallet}>
      <View style={styles.walletValue}>
        <T variant="footnote" style={styles.onGradientSoft}>
          Total value
        </T>
        <T variant="title1" style={[styles.onGradient, styles.walletAmount]} numberOfLines={1} adjustsFontSizeToFit>
          {live ? formatUsdValue(portfolio.totalUsd) : "—"}
        </T>
        <View style={styles.usdcLine}>
          {usdc.status === "known" ? <UsdcLogo size={14} /> : null}
          <T variant="footnote" style={[styles.onGradientSoft, styles.tabular, styles.shrink]} numberOfLines={2}>
            {usdcLine}
            {unpriced}
          </T>
        </View>
      </View>

      <View style={styles.walletActions}>
        <HapticPressable
          accessibilityRole="button"
          accessibilityLabel={copied ? "Wallet address copied" : `Copy wallet address ${shortAddress(address, 4)}`}
          onPress={() => copy(address).catch(() => {})}
          style={({ pressed }) => [styles.pill, styles.pillGlass, styles.pillGrow, pressed && styles.pressed]}
        >
          <Ionicons name="wallet-outline" size={16} color="#FFFFFF" />
          <T variant="subhead" style={[styles.onGradient, styles.pillText, styles.tabular, styles.shrink]} numberOfLines={1}>
            {copied ? "Copied" : shortAddress(address, 4)}
          </T>
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color="#FFFFFF" />
        </HapticPressable>
        <HapticPressable
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="Add funds"
          onPress={openFund}
          style={({ pressed }) => [styles.pill, styles.pillSolid, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={16} color={theme.ds.accent} />
          <T variant="subhead" tone="accent" style={styles.pillText}>
            Add funds
          </T>
        </HapticPressable>
      </View>
    </GradientCard>
  );
}

type Row = {
  key: string;
  mint: string | null;
  symbol: string;
  name: string;
  iconUrl: string | null | undefined;
  amount: string;
  usdValue: number | null;
  bagIds: string[];
};

type HoldingSelectionValue = {
  active: boolean;
  selected: ReadonlySet<string>;
  start: (mint: string) => void;
  toggle: (mint: string) => void;
};

const HoldingSelection = createContext<HoldingSelectionValue>({
  active: false,
  selected: new Set(),
  start: () => {},
  toggle: () => {},
});

/** USDC and SOL stay in the wallet: USDC is what you sell into and SOL covers fees outside Stockpile. */
function isSellable(row: Row) {
  return row.mint != null && row.key !== "usdc" && row.key !== "sol";
}

function HoldingRow({ row }: { row: Row }) {
  const { theme } = useUnistyles();
  const selection = useContext(HoldingSelection);
  const amountLine = `${row.amount} ${row.symbol}`;
  const sellable = isSellable(row);
  const selected = sellable && selection.selected.has(row.mint!);
  const label = `${row.symbol}, ${row.name}. ${formatUsdValue(row.usdValue)}, ${amountLine}`;
  const content = (
    <>
      {selection.active ? (
        <Ionicons
          name={selected ? "checkmark-circle" : sellable ? "ellipse-outline" : "remove-circle-outline"}
          size={22}
          color={selected ? theme.ds.accent : theme.ds.inkTertiary}
        />
      ) : null}
      <TokenAvatar symbol={row.symbol} mint={row.mint} iconUrl={row.iconUrl} size={AVATAR} />
      <View style={styles.textCol}>
        <View style={styles.titleLine}>
          <T variant="headline" numberOfLines={1}>
            {row.symbol}
          </T>
        </View>
        <T variant="footnote" tone="secondary" numberOfLines={1}>
          {row.name}
        </T>
      </View>
      <View style={styles.rightCol}>
        <T variant="numeric" style={styles.rightPrimary} numberOfLines={1}>
          {formatUsdValue(row.usdValue)}
        </T>
        <T variant="footnote" tone="secondary" style={[styles.rightSecondary, styles.tabular]} numberOfLines={1}>
          {amountLine}
        </T>
      </View>
    </>
  );
  if (!sellable) {
    return (
      <View style={[styles.row, selection.active && styles.rowMuted]} accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <HapticPressable
      accessibilityRole={selection.active ? "checkbox" : "button"}
      accessibilityLabel={label}
      accessibilityState={selection.active ? { checked: selected } : undefined}
      accessibilityHint={selection.active ? "Adds or removes it from the sale" : "Long-press to select tokens to sell"}
      onPress={selection.active ? () => selection.toggle(row.mint!) : undefined}
      // Keep a long-press handler in both modes: the row re-renders into selection mode mid-press, and
      // without one Pressability treats the release as a tap and immediately unticks the row.
      onLongPress={selection.active ? () => selection.toggle(row.mint!) : () => selection.start(row.mint!)}
      delayLongPress={300}
      style={({ pressed }) => [styles.row, (pressed || selected) && styles.rowPressed]}
    >
      {content}
    </HapticPressable>
  );
}

function holdingRows(data: Portfolio, loose: Holding[], assets: ReturnType<typeof indexAssetsByMint>): Row[] {
  const rows: Row[] = [];
  if (data.usdc && data.usdc.amount !== "0") {
    rows.push({
      key: "usdc",
      mint: USDC_MINT,
      symbol: "USDC",
      name: "USD Coin",
      iconUrl: null,
      amount: formatHoldingAmount(data.usdc.uiAmount),
      usdValue: data.usdc.usdValue,
      bagIds: [],
    });
  }
  if (data.sol && data.sol.amount !== "0") {
    rows.push({
      key: "sol",
      mint: null,
      symbol: "SOL",
      name: "Solana",
      iconUrl: null,
      amount: formatHoldingAmount(data.sol.uiAmount),
      usdValue: data.sol.usdValue,
      bagIds: [],
    });
  }
  // Bag tokens live in their bag; only what's held outside every bag position is listed here.
  for (const holding of loose) {
    if (holding.amount === "0" || holding.mint === USDC_MINT) continue;
    const asset = assets.get(holding.mint);
    const symbol = holding.symbol ?? asset?.symbol ?? shortAddress(holding.mint);
    const ui =
      holding.uiAmount ??
      formatTokenAmount(holding.amount, holding.decimals, asset?.uiAmountMultiplier ?? 1).replace(/,/g, "");
    rows.push({
      key: holding.mint,
      mint: holding.mint,
      symbol,
      name: holding.name ?? asset?.name ?? "Token",
      iconUrl: holding.iconUrl ?? asset?.iconUrl,
      amount: formatHoldingAmount(ui),
      usdValue: holding.usdValue,
      bagIds: holding.bagIds,
    });
  }
  return rows;
}

type AssetIndex = ReturnType<typeof indexAssetsByMint>;
type ActivityLeg = Activity["legs"][number];

function LegAvatar({ leg, assets, size }: { leg: ActivityLeg; assets: AssetIndex; size: number }) {
  const asset = assets.get(leg.mint);
  return (
    <TokenAvatar symbol={leg.symbol ?? asset?.symbol ?? "?"} mint={leg.mint} iconUrl={asset?.iconUrl} size={size} />
  );
}

/** Token (or action) mark in a canvas-coloured ring so it reads cleanly over the shape behind it. */
function Ringed({ size, style, children }: { size: number; style: object; children: React.ReactNode }) {
  const outer = size + ACTIVITY_RING * 2;
  return <View style={[styles.ring, { width: outer, height: outer, borderRadius: outer / 2 }, style]}>{children}</View>;
}

/**
 * Swaps: the two tokens overlapped (other side behind, subject in front). Transfers and other
 * items: a solid action circle with a small token badge on its corner.
 */
function ActivityAvatar({ item, line, assets }: { item: Activity; line: ReturnType<typeof describeActivity>; assets: AssetIndex }) {
  const { theme } = useUnistyles();
  const failed = item.status === "failed";
  if (!failed && item.kind === "swap" && line.front && line.back) {
    return (
      <View style={styles.activityAvatar}>
        <View style={styles.swapBack}>
          <LegAvatar leg={line.back} assets={assets} size={SWAP_TOKEN} />
        </View>
        <Ringed size={SWAP_TOKEN} style={styles.swapFront}>
          <LegAvatar leg={line.front} assets={assets} size={SWAP_TOKEN} />
        </Ringed>
      </View>
    );
  }
  const visual = activityVisual(item);
  const fill = failed
    ? theme.ds.dangerSoft
    : { accent: theme.ds.accent, positive: theme.ds.positive, neutral: theme.ds.inkTertiary, danger: theme.ds.danger }[visual.tone];
  const iconColor = failed ? theme.ds.danger : "#FFFFFF";
  const rotate = visual.icon === "arrow-down" || visual.icon === "arrow-up" ? "45deg" : "0deg";
  return (
    <View style={styles.activityAvatar}>
      <View style={[styles.actionCircle, { backgroundColor: fill }]}>
        <Ionicons name={visual.icon} size={22} color={iconColor} style={{ transform: [{ rotate }] }} />
      </View>
      {line.front ? (
        <Ringed size={ACTIVITY_BADGE} style={styles.actionBadge}>
          <LegAvatar leg={line.front} assets={assets} size={ACTIVITY_BADGE} />
        </Ringed>
      ) : null}
    </View>
  );
}

function ActivityRow({ item, bagsById, assets }: { item: Activity; bagsById: Map<string, Bag>; assets: AssetIndex }) {
  const when = relativeTime(item.ts);
  const failed = item.status === "failed";
  const line = describeActivity(item);
  const bag = item.bagId ? bagsById.get(item.bagId) : undefined;
  const detail = failed ? "Failed" : (bag?.title ?? line.detail);
  const amountTone = failed
    ? "tertiary"
    : line.amount?.tone === "negative"
      ? "danger"
      : line.amount?.tone === "positive"
        ? "positive"
        : "accent";
  return (
    <HapticPressable
      accessibilityRole="link"
      accessibilityLabel={`${item.summary}${when ? `, ${when}` : ""}${failed ? ", failed" : ""}. Opens in explorer`}
      onPress={() => WebBrowser.openBrowserAsync(item.explorerUrl).catch(() => {})}
      style={({ pressed }) => [styles.activityRow, pressed && styles.pressed]}
    >
      <ActivityAvatar item={item} line={line} assets={assets} />
      <View style={styles.textCol}>
        <T variant="headline" numberOfLines={1}>
          {line.verb}
          {line.subject ? (
            <T variant="headline" tone="secondary" style={styles.subjectText}>
              {` ${line.subject}`}
            </T>
          ) : null}
        </T>
        {detail ? (
          <T variant="footnote" tone={failed ? "danger" : "secondary"} style={styles.tabular} numberOfLines={1}>
            {detail}
          </T>
        ) : null}
      </View>
      <View style={styles.rightCol}>
        {line.amount ? (
          <T variant="numeric" tone={amountTone} style={[styles.rightPrimary, failed && styles.struck]} numberOfLines={1}>
            {line.amount.text}
          </T>
        ) : null}
        {when ? (
          <T variant="footnote" tone="secondary" style={styles.rightSecondary} numberOfLines={1}>
            {when}
          </T>
        ) : null}
      </View>
    </HapticPressable>
  );
}

function ActivitySection({ bagsById, assets }: { bagsById: Map<string, Bag>; assets: AssetIndex }) {
  const { theme } = useUnistyles();
  const activity = useActivity();
  const { fetchNextPage, isFetchNextPageError } = activity;
  const first = activity.data?.pages[0];
  const items = flattenActivity(activity.data?.pages);

  let body: React.ReactNode;
  if (activity.isPending) {
    body = (
      <ListCard>
        <View style={[styles.row, styles.skeletons]}>
          <Skeleton height={16} width="70%" />
          <Skeleton height={16} width="45%" />
        </View>
      </ListCard>
    );
  } else if ((activity.isError && !isFetchNextPageError) || (first && first.status !== "live")) {
    body = (
      <StatusCard
        title="Activity unavailable"
        body={
          activity.isError
            ? activity.error.message
            : (first?.error?.message ?? first?.message ?? "We couldn’t read your wallet history right now.")
        }
        onRetry={() => activity.refetch()}
      />
    );
  } else if (items.length === 0) {
    body = (
      <ListCard>
        <View style={styles.row}>
          <IconBadge icon="time-outline" color={theme.ds.inkSecondary} background={theme.ds.sunken} />
          <View style={styles.textCol}>
            <T variant="headline" tone="secondary">
              No activity yet
            </T>
          </View>
        </View>
      </ListCard>
    );
  } else {
    body = (
      <View>
        {groupActivityByDay(items).map((group, index) => (
          <View key={`${group.label}-${group.items[0].signature}`} style={index > 0 && styles.dayGroup}>
            <T variant="headline" style={styles.dayLabel} accessibilityRole="header">
              {group.label}
            </T>
            {group.items.map((item) => (
              <ActivityRow key={item.signature} item={item} bagsById={bagsById} assets={assets} />
            ))}
          </View>
        ))}
        {activity.isFetchingNextPage ? (
          <View style={styles.more}>
            <ActivityIndicator color={theme.ds.inkTertiary} />
          </View>
        ) : isFetchNextPageError ? (
          <HapticPressable
            accessibilityRole="button"
            onPress={() => fetchNextPage()}
            style={({ pressed }) => [styles.more, pressed && styles.rowPressed]}
          >
            <T variant="footnote" tone="accent">
              Couldn’t load more · Try again
            </T>
          </HapticPressable>
        ) : null}
      </View>
    );
  }

  return <PortfolioSection title="Activity">{body}</PortfolioSection>;
}

function PortfolioBody() {
  const { holdings: loose, portfolio, positions, settled } = useLooseHoldings();
  const bags = useBags();
  const { walletAddress: embeddedWallet } = useStockpileAuth();
  const bagsById = new Map((bags.data ?? []).map((bag) => [bag.id, bag]));

  if (portfolio.isPending) return <CardSkeleton />;
  if (portfolio.isError) {
    return (
      <HeroState
        gradient="coral"
        icon="cloud-offline"
        title="Couldn’t load your portfolio"
        body={portfolio.error.message}
        actionLabel="Try again"
        actionIcon="refresh"
        onAction={() => portfolio.refetch()}
      />
    );
  }

  const data = portfolio.data;
  const walletAddress = data.walletAddress ?? embeddedWallet;
  const assets = indexAssetsByMint(bags.data);
  const rows = holdingRows(data, loose, assets);
  const hasTokens = rows.some((row) => row.key !== "usdc" && row.key !== "sol");
  const hasBags = heldPositions(positions.data).length > 0;
  const asOf = formatAsOf(data.asOf);

  return (
    <>
      {walletAddress ? <WalletCard address={walletAddress} portfolio={data} /> : null}

      <PositionsSection />

      {data.status !== "live" ? (
        <PortfolioSection title="Holdings">
          <StatusCard
            title="Balances unavailable"
            body={data.message ?? "We couldn’t read your on-chain balances right now."}
            onRetry={() => portfolio.refetch()}
          />
        </PortfolioSection>
      ) : (
        <PortfolioSection
          title="Holdings"
          trailing={hasTokens ? "Hold to select and sell" : asOf ? `Updated ${asOf}` : null}
        >
          {rows.length > 0 ? (
            <ListCard>
              <Rows items={rows} keyOf={(row) => row.key} render={(row) => <HoldingRow row={row} />} />
            </ListCard>
          ) : null}
          {settled && !hasTokens && !hasBags ? <NoBagTokensHint /> : null}
        </PortfolioSection>
      )}

      <ActivitySection bagsById={bagsById} assets={assets} />
    </>
  );
}

export default function PortfolioScreen() {
  const portfolio = usePortfolio();
  const activity = useActivity();
  const positions = usePositions();
  const { authenticated } = useStockpileAuth();
  const { holdings: loose } = useLooseHoldings();
  const [picks, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // Only picks still listed count: anything sold or moved into a bag drops out on its own.
  const selected = useMemo<ReadonlySet<string>>(() => {
    const present = new Set(loose.map((holding) => holding.mint));
    return new Set([...picks].filter((mint) => present.has(mint)));
  }, [picks, loose]);
  const active = selected.size > 0;
  const clear = useCallback(() => setSelected(new Set()), []);
  const selection = useMemo<HoldingSelectionValue>(
    () => ({
      active,
      selected,
      start: (mint) => setSelected(new Set([mint])),
      toggle: (mint) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(mint)) next.delete(mint);
          else next.add(mint);
          return next;
        }),
    }),
    [active, selected],
  );

  // Leaving the tab ends selection.
  useFocusEffect(useCallback(() => clear, [clear]));
  // The selection toolbar replaces the tab bar, like Photos/Files.
  useHideTabBar(active);
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      clear();
      return true;
    });
    return () => sub.remove();
  }, [active, clear]);

  const picked = loose.filter((holding) => selected.has(holding.mint));
  const pickedUsd = picked.every((holding) => holding.usdValue != null)
    ? picked.reduce((sum, holding) => sum + (holding.usdValue ?? 0), 0)
    : null;
  const sellPicked = () => {
    const mints = picked.map((holding) => holding.mint);
    clear();
    router.push({ pathname: "/sell-tokens", params: { mints: mints.join(",") } });
  };

  return (
    <HoldingSelection.Provider value={selection}>
      <Screen
        title="Portfolio"
        footer={
          active ? (
            <View style={styles.selectionBar}>
              <PrimaryButton label="Cancel" variant="ghost" size="md" onPress={clear} />
              <View style={styles.flex}>
                <PrimaryButton
                  label={`Sell ${picked.length} ${picked.length === 1 ? "token" : "tokens"}${pickedUsd != null ? ` · ≈ ${formatUsdValue(pickedUsd)}` : ""}`}
                  icon="swap-horizontal"
                  size="md"
                  onPress={sellPicked}
                  disabled={picked.length === 0}
                />
              </View>
            </View>
          ) : undefined
        }
        onRefresh={
          authenticated
            ? () => Promise.all([portfolio.refetch(), activity.refetch(), positions.refetch()])
            : undefined
        }
        onEndReached={
          authenticated
            ? () => {
                if (activity.hasNextPage && !activity.isFetchingNextPage && !activity.isFetchNextPageError) {
                  activity.fetchNextPage();
                }
              }
            : undefined
        }
      >
        <AuthGate
          gradient="blue"
          icon="pie-chart"
          accents={["wallet", "layers"]}
          title="Your bags, on-chain"
          body="Sign in to see your wallet balance, the tokens you hold and your activity."
        >
          <PortfolioBody />
        </AuthGate>
      </Screen>
    </HoldingSelection.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  onGradient: { color: "#FFFFFF" },
  onGradientSoft: { color: "rgba(255,255,255,0.82)" },
  tabular: { fontVariant: ["tabular-nums"] },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  selectionBar: { flexDirection: "row", alignItems: "center", gap: theme.density.item },

  section: { gap: theme.density.sectionHeader, marginTop: theme.density.section - theme.density.stack },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.density.rowGap,
  },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: "600", letterSpacing: -0.2, flexShrink: 1 },

  wallet: { gap: theme.density.stack, padding: theme.density.hero },
  walletValue: { gap: 2 },
  walletAmount: { fontSize: 36, lineHeight: 42, fontVariant: ["tabular-nums"], letterSpacing: -0.8 },
  usdcLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  walletActions: { flexDirection: "row", alignItems: "center", gap: theme.density.item },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: WALLET_PILL,
    paddingHorizontal: 14,
    borderRadius: WALLET_PILL / 2,
  },
  pillText: { lineHeight: 20, includeFontPadding: false, textAlignVertical: "center" },
  pillGrow: { flex: 1, minWidth: 0 },
  pillGlass: { backgroundColor: "rgba(255,255,255,0.2)" },
  pillSolid: { backgroundColor: "#FFFFFF" },

  listCard: {
    ...theme.rounded(24),
    backgroundColor: theme.ds.surface,
    shadowColor: "#1B2250",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  listClip: { ...theme.rounded(24), overflow: "hidden" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_GAP,
    paddingHorizontal: ROW_H_PAD,
    paddingVertical: theme.density.rowY,
  },
  rowPressed: { backgroundColor: theme.ds.sunken },
  rowMuted: { opacity: 0.45 },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 21 },
  rightCol: { maxWidth: "50%", flexShrink: 0, alignItems: "flex-end", gap: 2 },
  rightPrimary: { lineHeight: 21, textAlign: "right", fontVariant: ["tabular-nums"] },
  rightSecondary: { textAlign: "right" },
  rightInline: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 21, flexShrink: 0 },
  struck: { textDecorationLine: "line-through" },
  bold: { fontWeight: "600" },
  positionRow: { alignItems: "center" },
  cluster: { minWidth: AVATAR, alignItems: "flex-start" },
  positionRight: { alignItems: "flex-end", gap: 2, flexShrink: 0 },
  sellPill: {
    minHeight: 32,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    backgroundColor: theme.ds.accentSoft,
  },
  badge: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: "center", justifyContent: "center" },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    gap: 3,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 999,
  },
  chipText: { fontSize: 11, lineHeight: 14 },
  chipAccent: { backgroundColor: theme.ds.accentSoft },
  chipCaution: { backgroundColor: theme.ds.cautionSoft },

  dayGroup: { marginTop: theme.density.rowY },
  dayLabel: { fontSize: 17, lineHeight: 22, fontWeight: "700", marginBottom: 2 },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: theme.density.rowY,
  },
  subjectText: { fontWeight: "500" },
  activityAvatar: { width: ACTIVITY_AVATAR, height: ACTIVITY_AVATAR },
  actionCircle: {
    width: ACTIVITY_AVATAR,
    height: ACTIVITY_AVATAR,
    borderRadius: ACTIVITY_AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: { backgroundColor: theme.ds.canvas, alignItems: "center", justifyContent: "center" },
  actionBadge: { position: "absolute", right: -ACTIVITY_RING - 2, bottom: -ACTIVITY_RING - 2 },
  swapBack: { position: "absolute", top: 0, left: 0 },
  swapFront: { position: "absolute", right: -ACTIVITY_RING, bottom: -ACTIVITY_RING },

  skeletons: { flexDirection: "column", alignItems: "flex-start", gap: 10 },
  more: { paddingVertical: theme.density.rowY, alignItems: "center" },
}));
