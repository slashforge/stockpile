import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AuthGate } from "@/components/stockpile/auth-gate";
import { GradientCard } from "@/components/stockpile/gradient-card";
import { LowSolPill, useFundSheet } from "@/components/stockpile/fund-sheet";
import { HeroState } from "@/components/stockpile/hero-state";
import { CardSkeleton, Divider, Screen, Skeleton } from "@/components/stockpile/layout";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { UsdcLogo } from "@/components/stockpile/token-logos";
import { T } from "@/components/stockpile/type";
import { density } from "@/config/sizing";
import { useActivity, usePortfolio } from "@/hooks/use-account";
import { indexAssetsByMint, useBags } from "@/hooks/use-bags";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useOpenSell } from "@/hooks/use-open-sell";
import { usePositions } from "@/hooks/use-positions";
import { changeTone, formatSignedPct } from "@/lib/market";
import { type BagPosition, heldPositions } from "@/services/api/positions";
import { LogoCluster } from "@/components/stockpile/bag-art";
import { isLowSol } from "@/lib/funding";
import {
  activityVisual,
  describeActivity,
  flattenActivity,
  formatHoldingAmount,
  formatUsdValue,
  relativeTime,
} from "@/lib/portfolio";
import { USDC_MINT } from "@/lib/solana/transaction";
import { solBalance, spendableUsdc } from "@/lib/trade/balance";
import { useStockpileAuth } from "@/providers/auth-context";
import type { Activity, Bag, Portfolio } from "@/services/api/types";
import { formatMoney, formatTokenAmount, shortAddress } from "@/utils/amounts";

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
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [...chipStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}. Check again`}
          hitSlop={8}
          onPress={onRetry}
          style={({ pressed }) => [styles.rightInline, pressed && styles.pressed]}
        >
          <T variant="subhead" tone="accent">
            Retry
          </T>
        </Pressable>
      </View>
    </ListCard>
  );
}

/** One-row nudge shown when the wallet holds no bag tokens; keeps Activity above the fold. */
function NoBagTokensHint() {
  const { theme } = useUnistyles();
  return (
    <ListCard>
      <Pressable
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
      </Pressable>
    </ListCard>
  );
}

function PositionRow({ position, onSell }: { position: BagPosition; onSell: () => void }) {
  const tone = changeTone(position.pnlPct);
  const pnlTone = tone === "up" ? "positive" : tone === "down" ? "danger" : "secondary";
  const tokens = `${position.legs.length} ${position.legs.length === 1 ? "token" : "tokens"}`;
  const traded = relativeTime(position.lastTradedAt);
  return (
    <Pressable
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sell ${position.title}`}
          hitSlop={8}
          onPress={onSell}
          style={({ pressed }) => [styles.sellPill, pressed && styles.pressed]}
        >
          <T variant="subhead" tone="accent" style={styles.bold}>
            Sell
          </T>
        </Pressable>
      ) : null}
    </Pressable>
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
        <Pressable
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
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add funds"
          onPress={openFund}
          style={({ pressed }) => [styles.pill, styles.pillSolid, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={16} color={theme.ds.accent} />
          <T variant="subhead" tone="accent" style={styles.pillText}>
            Add funds
          </T>
        </Pressable>
      </View>
      <LowSolPill />
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
  lowFees?: boolean;
};

function HoldingRow({ row }: { row: Row }) {
  const amountLine = `${row.amount} ${row.symbol}`;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${row.symbol}, ${row.name}. ${formatUsdValue(row.usdValue)}, ${amountLine}`}
    >
      <TokenAvatar symbol={row.symbol} mint={row.mint} iconUrl={row.iconUrl} size={AVATAR} />
      <View style={styles.textCol}>
        <View style={styles.titleLine}>
          <T variant="headline" numberOfLines={1}>
            {row.symbol}
          </T>
          {row.lowFees ? <RowChip icon="flash-outline" label="Low for fees" tone="caution" /> : null}
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
    </View>
  );
}

function holdingRows(data: Portfolio, assets: ReturnType<typeof indexAssetsByMint>): Row[] {
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
      lowFees: isLowSol(solBalance(data)),
    });
  }
  for (const holding of data.holdings) {
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

function ActivityRow({ item, bagsById }: { item: Activity; bagsById: Map<string, Bag> }) {
  const { theme } = useUnistyles();
  const visual = activityVisual(item);
  const color = {
    accent: theme.ds.accent,
    positive: theme.ds.positive,
    neutral: theme.ds.inkSecondary,
    danger: theme.ds.danger,
  }[visual.tone];
  const background = {
    accent: theme.ds.accentSoft,
    positive: theme.ds.mintSoft,
    neutral: theme.ds.sunken,
    danger: theme.ds.dangerSoft,
  }[visual.tone];
  const when = relativeTime(item.ts);
  const failed = item.status === "failed";
  const line = describeActivity(item);
  const bag = item.bagId ? bagsById.get(item.bagId) : undefined;
  const subtitle = [failed ? "Failed" : null, when, bag?.title].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${item.summary}${when ? `, ${when}` : ""}${failed ? ", failed" : ""}. Opens in explorer`}
      onPress={() => WebBrowser.openBrowserAsync(item.explorerUrl).catch(() => {})}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <IconBadge icon={visual.icon} color={color} background={background} />
      <View style={styles.textCol}>
        <T variant="headline" numberOfLines={1}>
          {line.title}
        </T>
        <T variant="footnote" tone={failed ? "danger" : "secondary"} numberOfLines={1}>
          {subtitle || "—"}
        </T>
      </View>
      <View style={styles.rightCol}>
        {line.primary ? (
          <T
            variant="numeric"
            tone={failed ? "tertiary" : line.primary.tone === "positive" ? "positive" : undefined}
            style={[styles.rightPrimary, failed && styles.struck]}
            numberOfLines={1}
          >
            {line.primary.text}
          </T>
        ) : null}
        <View style={styles.rightInline}>
          {line.secondary ? (
            <T variant="footnote" tone="secondary" style={styles.tabular} numberOfLines={1}>
              {line.secondary}
            </T>
          ) : null}
          <Ionicons name="open-outline" size={13} color={theme.ds.inkTertiary} />
        </View>
      </View>
    </Pressable>
  );
}

function ActivitySection({ bagsById }: { bagsById: Map<string, Bag> }) {
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
      <ListCard>
        <Rows items={items} keyOf={(item) => item.signature} render={(item) => <ActivityRow item={item} bagsById={bagsById} />} />
        {activity.isFetchingNextPage ? (
          <View style={styles.more}>
            <ActivityIndicator color={theme.ds.inkTertiary} />
          </View>
        ) : isFetchNextPageError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => fetchNextPage()}
            style={({ pressed }) => [styles.more, pressed && styles.rowPressed]}
          >
            <T variant="footnote" tone="accent">
              Couldn’t load more · Try again
            </T>
          </Pressable>
        ) : null}
      </ListCard>
    );
  }

  return <PortfolioSection title="Activity">{body}</PortfolioSection>;
}

function PortfolioBody() {
  const portfolio = usePortfolio();
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
  const rows = holdingRows(data, indexAssetsByMint(bags.data));
  const hasTokens = rows.some((row) => row.key !== "usdc" && row.key !== "sol");
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
        <PortfolioSection title="Holdings" trailing={asOf ? `Updated ${asOf}` : null}>
          {rows.length > 0 ? (
            <ListCard>
              <Rows items={rows} keyOf={(row) => row.key} render={(row) => <HoldingRow row={row} />} />
            </ListCard>
          ) : null}
          {!hasTokens ? <NoBagTokensHint /> : null}
        </PortfolioSection>
      )}

      <ActivitySection bagsById={bagsById} />
    </>
  );
}

export default function PortfolioScreen() {
  const portfolio = usePortfolio();
  const activity = useActivity();
  const positions = usePositions();
  const { authenticated } = useStockpileAuth();
  return (
    <Screen
      title="Portfolio"
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
  );
}

const styles = StyleSheet.create((theme) => ({
  onGradient: { color: "#FFFFFF" },
  onGradientSoft: { color: "rgba(255,255,255,0.82)" },
  tabular: { fontVariant: ["tabular-nums"] },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.7 },

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

  skeletons: { flexDirection: "column", alignItems: "flex-start", gap: 10 },
  more: { paddingVertical: theme.density.rowY, alignItems: "center" },
}));
