import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Chip, heroSize, SlippageControl } from "@/components/stockpile/buy/controls";
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
import { formatMoney } from "@/utils/amounts";

export default function SellAmountScreen() {
  const flow = useSellFlow();
  const auth = useStockpileAuth();
  const insets = useSafeAreaInsets();
  const { bag, quote, prepare, prepared, portionBps, position } = flow;
  const bottom = { paddingBottom: insets.bottom + 8 };

  if (!bag.data) {
    return (
      <View style={[styles.root, bottom]}>
        {bag.isError ? (
          <MessageState tone="error" icon="alert-circle-outline" title="Bag unavailable" body={bag.error.message} />
        ) : (
          <View style={styles.loading}>
            <Skeleton height={84} width="60%" radius={20} />
            <Skeleton height={260} radius={24} />
          </View>
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
  const heroText = quote.isPending || !totalOut ? "—" : `≈ $${formatMoney(totalOut.toString(), USDC_DECIMALS)}`;
  const quoteError = quote.isError
    ? quote.error.message
    : quote.data?.status === "unavailable"
      ? tradeErrorMessage(quote.data.error, quote.data.message ?? "Couldn’t price this sale right now.")
      : null;
  const prepareError = prepare.isError
    ? prepare.error.message
    : !prepare.isPending && prepared?.status === "unavailable"
      ? tradeErrorMessage(prepared.error, prepared.message ?? "The swaps couldn’t be built right now.")
      : null;
  const error = prepareError ?? quoteError;

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
      <SlippageControl
        value={flow.slippageBps}
        onChange={(bps) => {
          flow.setSlippageBps(bps);
          prepare.reset();
        }}
      />
      <View style={styles.hero}>
        <T
          style={[styles.heroAmount, heroSize(heroText), !totalOut && styles.heroEmpty]}
          numberOfLines={1}
          accessibilityLabel={totalOut ? `About ${formatMoney(totalOut.toString(), USDC_DECIMALS)} USDC back` : "Estimate loading"}
          testID="Sell estimate in USDC"
        >
          {heroText}
        </T>
        <View style={styles.balanceLine}>
          <UsdcLogo size={14} />
          <T variant="footnote" tone="tertiary" align="center" numberOfLines={2} style={styles.shrink}>
            {position?.valueUsd != null
              ? `back in USDC · you hold ≈ ${formatUsdValue(position.valueUsd)}`
              : "back in USDC"}
          </T>
        </View>
      </View>
      <View style={styles.presets}>
        {SELL_PORTIONS.map((bps) => (
          <Chip
            key={bps}
            compact
            label={`${bps / 100}%`}
            selected={portionBps === bps}
            onPress={() => setPortion(bps)}
          />
        ))}
      </View>
      <ScrollView style={styles.legs} contentContainerStyle={styles.legsContent} showsVerticalScrollIndicator={false}>
        {available ? (
          <Card padded={false}>
            {available.legs.map((leg, index) => (
              <View key={`${leg.inputMint}-${index}`}>
                {index > 0 ? <Divider inset={58} /> : null}
                <LegRow tx={leg} bag={bagData} side="sell" />
              </View>
            ))}
          </Card>
        ) : quote.isPending ? (
          <Skeleton height={150} radius={24} />
        ) : null}
      </ScrollView>
      {error ? (
        <T variant="footnote" tone="danger" align="center" numberOfLines={3}>
          {error}
        </T>
      ) : null}
      <PrimaryButton
        label="Review"
        onPress={review}
        disabled={!available || available.legs.length === 0}
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
  loading: { gap: theme.density.stack, paddingTop: 24, alignItems: "center" },
  shrink: { flexShrink: 1 },
  hero: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 8 },
  heroAmount: {
    fontWeight: "800",
    color: theme.ds.ink,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    alignSelf: "stretch",
  },
  heroEmpty: { color: theme.ds.inkTertiary },
  balanceLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  presets: { flexDirection: "row", justifyContent: "center", gap: theme.density.item },
  legs: { flex: 1 },
  legsContent: { paddingBottom: 4 },
}));
