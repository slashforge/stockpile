import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { protectionLabel } from "@/components/stockpile/buy/controls";
import { legBlocking, LegRow } from "@/components/stockpile/buy/leg-row";
import { sellTotalOut, useSellFlow } from "@/components/stockpile/buy/sell-flow-context";
import { Card, Divider, MessageState, Notice, Pill } from "@/components/stockpile/layout";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { SlideToConfirm } from "@/components/stockpile/slide-to-confirm";
import { T } from "@/components/stockpile/type";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { impactLevel } from "@/lib/trade/legs";
import { legsToSign } from "@/lib/trade/purchase";
import { isPreparedExpired } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatMoney, shortAddress } from "@/utils/amounts";

export default function SellReviewScreen() {
  const flow = useSellFlow();
  const auth = useStockpileAuth();
  const insets = useSafeAreaInsets();
  const { bag, prepared, preparedAt, expired, secondsLeft, request, prepare, signing, portionBps } = flow;
  const bagData = bag.data;
  const ready = prepared?.status === "ready" ? prepared : null;
  const [slideReset, setSlideReset] = useState(0);

  const blocking = useMemo(() => {
    if (!ready || !bagData) return [];
    const total = ready.transactions.length;
    return ready.transactions.flatMap((tx, index) =>
      legBlocking(tx, bagData, index, total, auth.walletAddress, "sell").map(
        (problem) => `${tx.symbol}: ${problem}`,
      ),
    );
  }, [ready, bagData, auth.walletAddress]);

  if (!bagData || !ready) {
    return (
      <View style={[styles.root, styles.padded]}>
        <MessageState
          tone="error"
          icon="alert-circle-outline"
          title="Nothing to review"
          body="Pick how much to sell to build this sale."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const walletMismatch = !!ready.walletAddress && ready.walletAddress !== auth.walletAddress;
  const totalUsdc = formatMoney(sellTotalOut(ready).toString(), USDC_DECIMALS);
  const warnLegs = ready.transactions.filter((tx) => {
    const level = impactLevel(tx.priceImpactPct);
    return level === "warn" || level === "high";
  });
  const toSign = legsToSign(flow.assetMints, signing.states, flow.alreadyBought);
  const blocked = blocking.length > 0 || walletMismatch;

  const sell = () => {
    // The clock only ticks once a second; never send a transaction past the blockhash lifetime.
    if (isPreparedExpired(preparedAt, Date.now())) {
      flow.refreshClock();
      setSlideReset((n) => n + 1);
      Alert.alert(
        "Prices expired",
        "This sale waited too long and would fail on Solana. Nothing was sent. Refresh and try again.",
      );
      return;
    }
    router.push({ pathname: "/sell/[bagId]/progress", params: { bagId: flow.bagId } });
    signing.signAll(toSign.map((index) => ({ index, transaction: ready.transactions[index].transaction })));
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.padded, styles.content]} showsVerticalScrollIndicator={false}>
        <Card style={styles.summary}>
          <View style={styles.flex}>
            <T variant="caption" tone="tertiary">
              You get back about
            </T>
            <T variant="title2">${totalUsdc} USDC</T>
          </View>
          <View style={styles.summaryMeta}>
            <Pill
              icon="time-outline"
              label={prepare.isPending ? "Refreshing…" : expired ? "Expired" : `Expires in ${secondsLeft ?? 0}s`}
              tone={expired ? "caution" : (secondsLeft ?? 0) <= 15 ? "caution" : "accent"}
              style={styles.pill}
            />
            <T variant="caption" tone="tertiary">
              Selling {portionBps / 100}% · Protection {protectionLabel(ready.slippageBps)} · Fees on us
            </T>
          </View>
        </Card>

        <Card padded={false}>
          {ready.transactions.map((tx, index) => (
            <View key={`${preparedAt}-${index}`}>
              {index > 0 ? <Divider inset={58} /> : null}
              <LegRow tx={tx} bag={bagData} side="sell" />
            </View>
          ))}
          <Divider />
          <View style={styles.total}>
            <T variant="subhead" style={[styles.flex, styles.bold]}>
              Total · {ready.transactions.length} swaps to USDC
            </T>
            <T variant="numeric">{totalUsdc} USDC</T>
          </View>
        </Card>

        {warnLegs.length > 0 ? (
          <Notice tone="caution" icon="warning-outline">
            <T variant="footnote" tone="caution">
              {warnLegs.map((tx) => tx.symbol).join(", ")} {warnLegs.length === 1 ? "has" : "have"} thin
              liquidity, so part of the value is lost to price impact. Selling a smaller portion helps.
            </T>
          </Notice>
        ) : null}
        {walletMismatch ? (
          <Notice tone="error">
            <T variant="footnote" tone="danger">
              Built for {shortAddress(ready.walletAddress ?? "")}, which isn’t your signed-in wallet (
              {shortAddress(auth.walletAddress ?? "")}). Selling is blocked.
            </T>
          </Notice>
        ) : null}
        {blocking.length > 0 ? (
          <Notice tone="error">
            {blocking.map((problem) => (
              <T key={problem} variant="footnote" tone="danger">
                {problem}
              </T>
            ))}
            <T variant="footnote" tone="danger" style={styles.bold}>
              Selling is blocked for your safety.
            </T>
          </Notice>
        ) : null}
        {prepare.isError ? (
          <T variant="footnote" tone="danger" align="center">
            {prepare.error.message}
          </T>
        ) : null}
        <T variant="caption" tone="tertiary" align="center">
          Your tokens are swapped to USDC in your wallet. Swiping signs every swap at once. Estimates
          move until they land. Stockpile covers network fees. This can’t be undone.
        </T>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {expired || prepare.isPending ? (
          <PrimaryButton
            label="Refresh prices"
            icon="refresh"
            onPress={() => flow.runPrepare(request)}
            loading={prepare.isPending}
          />
        ) : (
          <SlideToConfirm
            label={`Swipe to sell · ≈ $${totalUsdc}`}
            tone="danger"
            onConfirm={sell}
            disabled={blocked || toSign.length === 0}
            resetKey={slideReset}
            accessibilityHint={`Swipe right to sell ${portionBps / 100}% of ${bagData.title}`}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1 },
  padded: { paddingHorizontal: theme.density.gutter },
  content: { gap: theme.density.stack, paddingTop: 4, paddingBottom: 16 },
  flex: { flex: 1 },
  bold: { fontWeight: "600" },
  summary: { flexDirection: "row", alignItems: "center", gap: theme.density.rowGap },
  summaryMeta: { alignItems: "flex-end", gap: 6 },
  pill: { alignSelf: "flex-end" },
  total: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.density.card,
    paddingVertical: 12,
  },
  footer: { paddingHorizontal: theme.density.gutter, paddingTop: 8 },
}));
