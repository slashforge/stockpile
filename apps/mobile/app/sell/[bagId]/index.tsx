import { router } from "expo-router";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Chip, heroSize } from "@/components/stockpile/buy/controls";
import { LegRow } from "@/components/stockpile/buy/leg-row";
import { SELL_PORTIONS, sellTotalOut, useSellFlow } from "@/components/stockpile/buy/sell-flow-context";
import { Card, Divider, MessageState, Skeleton } from "@/components/stockpile/layout";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { UsdcLogo } from "@/components/stockpile/token-logos";
import { T } from "@/components/stockpile/type";
import { formatUsdValue } from "@/lib/portfolio";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { tradeErrorMessage } from "@/lib/trade/legs";
import { useStockpileAuth } from "@/providers/auth-context";
import type { QuoteLeg } from "@/services/api/types";
import { formatMoney } from "@/utils/amounts";

/** Sum of every leg's minimum USDC out, or null when any leg doesn't report one. */
function minTotalOut(legs: QuoteLeg[]) {
  let total = 0n;
  for (const leg of legs) {
    if (!leg.minOutAmount || !/^\d+$/.test(leg.minOutAmount)) return null;
    total += BigInt(leg.minOutAmount);
  }
  return total;
}

function LegSkeletonRows({ count }: { count: number }) {
  return (
    <Card padded={false} style={styles.legsCard}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index}>
          {index > 0 ? <Divider inset={58} /> : null}
          <View style={styles.skeletonLeg}>
            <Skeleton height={32} width={32} radius={16} />
            <View style={styles.skeletonLegText}>
              <Skeleton height={14} width="38%" radius={6} />
              <Skeleton height={11} width="62%" radius={5} />
            </View>
            <Skeleton height={16} width={52} radius={6} />
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Full-screen placeholder that mirrors the loaded layout so nothing jumps when the bag arrives. */
function SellScreenSkeleton() {
  return (
    <>
      <View style={styles.skeletonPill}>
        <Skeleton height={30} width={132} radius={15} />
      </View>
      <View style={styles.hero}>
        <Skeleton height={12} width={96} radius={6} />
        <Skeleton height={68} width={210} radius={18} />
        <Skeleton height={14} width={180} radius={7} />
      </View>
      <View style={styles.presets}>
        {SELL_PORTIONS.map((bps) => (
          <Skeleton key={bps} height={32} width={60} radius={16} />
        ))}
      </View>
      <View style={styles.legsHeader}>
        <Skeleton height={13} width={96} radius={6} />
      </View>
      <LegSkeletonRows count={2} />
      <Skeleton height={54} radius={27} />
    </>
  );
}

export default function SellAmountScreen() {
  const flow = useSellFlow();
  const auth = useStockpileAuth();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const { bag, quote, prepare, prepared, portionBps, position } = flow;
  const bottom = { paddingBottom: insets.bottom + 8 };

  if (!bag.data) {
    return (
      <View style={[styles.root, bottom]} accessibilityLabel="Loading sale" accessibilityState={{ busy: !bag.isError }}>
        {bag.isError ? (
          <MessageState tone="error" icon="alert-circle-outline" title="Bag unavailable" body={bag.error.message} />
        ) : (
          <SellScreenSkeleton />
        )}
      </View>
    );
  }
  if (!auth.authenticated) {
    return (
      <View style={[styles.root, bottom]}>
        <MessageState icon="person-circle" title="Sign in to continue" body="Sign in to sell from this bag." />
      </View>
    );
  }
  if (!auth.walletAddress) {
    return (
      <View style={[styles.root, bottom]}>
        <MessageState
          icon="wallet-outline"
          title="Setting up your wallet"
          body="Your Solana wallet isn't ready yet. This usually takes a few seconds after your first sign-in."
        />
      </View>
    );
  }

  const bagData = bag.data;
  const available = quote.data?.status === "available" ? quote.data : null;
  const totalOut = available ? sellTotalOut(available) : null;
  const minOut = available ? minTotalOut(available.legs) : null;
  const firstLoad = quote.isPending;
  const updating = quote.isPlaceholderData;
  const heroText = totalOut != null ? `≈ $${formatMoney(totalOut.toString(), USDC_DECIMALS)}` : "—";
  const legCount = available?.legs.length ?? Math.min(Math.max(bagData.assets.length, 1), 4);
  const quoteError = quote.isError
    ? quote.error.message
    : quote.data?.status === "unavailable" && !quote.isPlaceholderData
      ? tradeErrorMessage(quote.data.error, quote.data.message ?? "Couldn’t price this sale right now.")
      : null;
  const prepareError = prepare.isError
    ? prepare.error.message
    : !prepare.isPending && prepared?.status === "unavailable"
      ? tradeErrorMessage(prepared.error, prepared.message ?? "The swaps couldn’t be built right now.")
      : null;
  const error = prepareError ?? quoteError;
  const portionLabel = `${portionBps / 100}%`;

  const setPortion = (bps: number) => {
    flow.setPortionBps(bps);
    prepare.reset();
  };

  const review = () => {
    flow.runPrepare(flow.request, {
      onDone: (data) => {
        if (data.status === "ready" && data.transactions.length > 0) {
          router.push({ pathname: "/sell/[bagId]/review", params: { bagId: flow.bagId } });
        }
      },
    });
  };

  return (
    <View style={[styles.root, bottom]}>
      <View style={styles.hero}>
        <T variant="caption" tone="tertiary" style={styles.eyebrow}>
          You get back
        </T>
        {firstLoad ? (
          <View style={styles.heroSkeleton} accessibilityLabel="Estimate loading">
            <Skeleton height={68} width={210} radius={18} />
          </View>
        ) : (
          <T
            style={[styles.heroAmount, heroSize(heroText), totalOut == null && styles.heroEmpty, updating && styles.stale]}
            numberOfLines={1}
            accessibilityLabel={
              totalOut != null ? `About ${formatMoney(totalOut.toString(), USDC_DECIMALS)} USDC back` : "No estimate"
            }
            testID="Sell estimate in USDC"
          >
            {heroText}
          </T>
        )}
        <View style={styles.balanceLine}>
          <UsdcLogo size={14} />
          <T variant="footnote" tone="tertiary" align="center" numberOfLines={2} style={styles.shrink}>
            {position?.valueUsd != null
              ? `USDC · ${portionLabel} of your ${formatUsdValue(position.valueUsd)} position`
              : `USDC · selling ${portionLabel} of this bag`}
          </T>
        </View>
      </View>
      <View style={styles.presets}>
        {SELL_PORTIONS.map((bps) => (
          <Chip
            key={bps}
            compact
            label={bps === 10000 ? "All" : `${bps / 100}%`}
            selected={portionBps === bps}
            onPress={() => setPortion(bps)}
          />
        ))}
      </View>
      <View style={styles.legsHeader}>
        <T variant="footnote" tone="secondary" style={styles.bold}>
          Swaps to USDC
        </T>
        <View style={styles.legsMeta}>
          {updating || firstLoad ? <ActivityIndicator size="small" color={theme.ds.inkTertiary} /> : null}
          <T variant="footnote" tone="tertiary">
            {updating || firstLoad ? "Getting prices" : `${legCount} ${legCount === 1 ? "token" : "tokens"}`}
          </T>
        </View>
      </View>
      <ScrollView style={styles.legs} contentContainerStyle={styles.legsContent} showsVerticalScrollIndicator={false}>
        {available ? (
          <View style={updating && styles.stale}>
            <Card padded={false} style={styles.legsCard}>
              {available.legs.map((leg, index) => (
                <View key={`${leg.inputMint}-${index}`}>
                  {index > 0 ? <Divider inset={58} /> : null}
                  <LegRow tx={leg} bag={bagData} side="sell" />
                </View>
              ))}
              {minOut != null ? (
                <>
                  <Divider />
                  <View style={styles.total}>
                    <T variant="footnote" tone="secondary" style={styles.flex}>
                      Minimum received
                    </T>
                    <T variant="numeric" style={styles.totalAmount}>
                      ${formatMoney(minOut.toString(), USDC_DECIMALS)}
                    </T>
                  </View>
                </>
              ) : null}
            </Card>
          </View>
        ) : firstLoad ? (
          <LegSkeletonRows count={legCount} />
        ) : null}
      </ScrollView>
      {error ? (
        <T variant="footnote" tone="danger" align="center" numberOfLines={3}>
          {error}
        </T>
      ) : null}
      <PrimaryButton
        label="Review sale"
        onPress={review}
        disabled={!available || available.legs.length === 0 || updating}
        loading={prepare.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    gap: theme.density.stack,
    paddingHorizontal: theme.density.gutter,
    paddingTop: 4,
  },
  flex: { flex: 1 },
  bold: { fontWeight: "600" },
  shrink: { flexShrink: 1 },
  hero: { flexGrow: 1, minHeight: 150, alignItems: "center", justifyContent: "center", gap: 8 },
  eyebrow: { fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  heroSkeleton: { height: 84, justifyContent: "center" },
  heroAmount: {
    fontWeight: "800",
    color: theme.ds.ink,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    alignSelf: "stretch",
  },
  heroEmpty: { color: theme.ds.inkTertiary },
  stale: { opacity: 0.45 },
  balanceLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  presets: { flexDirection: "row", justifyContent: "center", gap: theme.density.item },
  legsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: -4,
  },
  legsMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  legs: { flexGrow: 0, flexShrink: 1 },
  legsCard: theme.rounded(16),
  legsContent: { paddingBottom: 4 },
  total: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.density.card,
    paddingVertical: 11,
  },
  totalAmount: { fontSize: 15 },
  skeletonPill: { alignItems: "flex-end" },
  skeletonLeg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: theme.density.card,
    paddingVertical: 12,
  },
  skeletonLegText: { flex: 1, gap: 6 },
}));
