import { router } from "expo-router";
import { useMemo } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { useBuyFlow } from "@/components/stockpile/buy/flow-context";
import { legBlocking, LegRow } from "@/components/stockpile/buy/leg-row";
import { Card, Divider, MessageState, Notice, Pill } from "@/components/stockpile/layout";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { T } from "@/components/stockpile/type";
import { isPreIpoBag, PRE_IPO_REVIEW_NOTE } from "@/lib/pre-ipo";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { impactLevel, impactPercent, totalInput } from "@/lib/trade/legs";
import { legsToSign, purchaseConfirmMessage } from "@/lib/trade/purchase";
import { isPreparedExpired } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatBps, formatMoney, shortAddress } from "@/utils/amounts";

export default function BuyReviewScreen() {
  const flow = useBuyFlow();
  const auth = useStockpileAuth();
  const insets = useSafeAreaInsets();
  const { bag, prepared, preparedAt, expired, secondsLeft, request, prepare, signing } = flow;
  const bagData = bag.data;
  const ready = prepared?.status === "ready" ? prepared : null;

  const blocking = useMemo(() => {
    if (!ready || !bagData) return [];
    const total = ready.transactions.length;
    return ready.transactions.flatMap((tx, index) =>
      legBlocking(tx, bagData, index, total, auth.walletAddress).map((problem) => `${tx.symbol}: ${problem}`),
    );
  }, [ready, bagData, auth.walletAddress]);

  if (!bagData || !ready) {
    return (
      <View style={[styles.root, styles.padded]}>
        <MessageState
          tone="error"
          icon="alert-circle-outline"
          title="Nothing to review"
          body="Pick an amount to build this purchase."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const walletMismatch = !!ready.walletAddress && ready.walletAddress !== auth.walletAddress;
  const totalUsdc = formatMoney(totalInput(ready.transactions).toString(), USDC_DECIMALS);
  const warnLegs = ready.transactions.filter((tx) => {
    const level = impactLevel(tx.priceImpactPct);
    return level === "warn" || level === "high";
  });
  const toSign = legsToSign(flow.outputMints, signing.states, flow.alreadyBought);
  const blocked = blocking.length > 0 || walletMismatch;

  const rebuild = () => {
    if (request) flow.runPrepare(request);
  };

  const buy = () => {
    Alert.alert(
      `Buy ${bagData.title}?`,
      purchaseConfirmMessage({
        swaps: toSign.length,
        totalUsdc,
        slippageBps: ready.slippageBps,
        risky: warnLegs.map((tx) => ({
          symbol: tx.symbol,
          impactPct: impactPercent(tx.priceImpactPct),
        })),
      }),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Buy · $${totalUsdc}`,
          onPress: () => {
            // The dialog can sit open past the blockhash lifetime; never send a stale transaction.
            if (isPreparedExpired(preparedAt, Date.now())) {
              flow.refreshClock();
              Alert.alert(
                "Prices expired",
                "This purchase waited too long and would fail on Solana. Nothing was sent. Refresh and try again.",
              );
              return;
            }
            router.push({ pathname: "/buy/[bagId]/progress", params: { bagId: flow.bagId } });
            flow.signing.signAll(
              toSign.map((index) => ({ index, transaction: ready.transactions[index].transaction })),
            );
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.padded, styles.content]}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.summary}>
          <View style={styles.flex}>
            <T variant="caption" tone="tertiary">
              You put in
            </T>
            <T variant="title2">${totalUsdc} USDC</T>
          </View>
          <View style={styles.summaryMeta}>
            <Pill
              icon="time-outline"
              label={prepare.isPending ? "Refreshing…" : expired ? "Expired" : `Expires in ${secondsLeft ?? 0}s`}
              tone={expired ? "caution" : (secondsLeft ?? 0) <= 15 ? "caution" : "accent"}
            />
            <T variant="caption" tone="tertiary">
              Slippage {formatBps(ready.slippageBps)}
            </T>
          </View>
        </Card>

        <Card padded={false}>
          {ready.transactions.map((tx, index) => (
            <View key={`${preparedAt}-${index}`}>
              {index > 0 ? <Divider inset={58} /> : null}
              <LegRow tx={tx} bag={bagData} />
            </View>
          ))}
          <Divider />
          <View style={styles.total}>
            <T variant="subhead" style={[styles.flex, styles.bold]}>
              Total · {ready.transactions.length} swaps
            </T>
            <T variant="numeric">{totalUsdc} USDC</T>
          </View>
        </Card>

        {warnLegs.length > 0 ? (
          <Notice tone="caution" icon="warning-outline">
            <T variant="footnote" tone="caution">
              {warnLegs.map((tx) => tx.symbol).join(", ")} {warnLegs.length === 1 ? "has" : "have"} thin
              liquidity, so part of your money is lost to price impact. A smaller amount helps.
            </T>
          </Notice>
        ) : null}
        {isPreIpoBag(bagData) ? (
          <Notice tone="caution" icon="hourglass-outline">
            <T variant="footnote" tone="caution">
              {PRE_IPO_REVIEW_NOTE}
            </T>
          </Notice>
        ) : null}
        {walletMismatch ? (
          <Notice tone="error">
            <T variant="footnote" tone="danger">
              Built for {shortAddress(ready.walletAddress ?? "")}, which isn’t your signed-in wallet (
              {shortAddress(auth.walletAddress ?? "")}). Buying is blocked.
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
              Buying is blocked for your safety.
            </T>
          </Notice>
        ) : null}
        {prepare.isError ? (
          <T variant="footnote" tone="danger" align="center">
            {prepare.error.message}
          </T>
        ) : null}
        <T variant="caption" tone="tertiary" align="center">
          One confirmation signs every swap from your wallet. Estimates move until they land. Network
          fees are paid in SOL. Not investment advice.
        </T>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {expired || prepare.isPending ? (
          <PrimaryButton
            label="Refresh prices"
            icon="refresh"
            onPress={rebuild}
            loading={prepare.isPending}
            disabled={!request}
          />
        ) : (
          <PrimaryButton
            label={`Buy bag · $${totalUsdc}`}
            onPress={buy}
            disabled={blocked || toSign.length === 0}
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
  total: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.density.card,
    paddingVertical: 12,
  },
  footer: { paddingHorizontal: theme.density.gutter, paddingTop: 8 },
}));
