import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useBuyFlow } from "@/components/stockpile/buy/flow-context";
import { legBlocking, LegRow } from "@/components/stockpile/buy/leg-row";
import { Card, Divider, Notice } from "@/components/stockpile/layout";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { T } from "@/components/stockpile/type";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { totalInput, tradeErrorMessage } from "@/lib/trade/legs";
import { legDisplayStatus, legsToSign } from "@/lib/trade/purchase";
import { legSignature } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatMoney } from "@/utils/amounts";

export default function BuyProgressScreen() {
  const { theme } = useUnistyles();
  const flow = useBuyFlow();
  const auth = useStockpileAuth();
  const insets = useSafeAreaInsets();
  const { bag, prepared, signing, alreadyBought, request, prepare } = flow;
  const [retryError, setRetryError] = useState<string | null>(null);
  const ready = prepared?.status === "ready" ? prepared : null;
  const bagData = bag.data;
  if (!ready || !bagData) return null;

  // Signing starts in the same tick this screen is pushed; "idle" here only means it hasn't rendered yet.
  const status =
    flow.status === "idle" ? (retryError ? "partial" : "running") : flow.status;
  const displays = ready.transactions.map((tx, index) =>
    legDisplayStatus(signing.states[index], alreadyBought.has(tx.outputMint)),
  );
  const done = displays.filter((value) => value === "confirmed" || value === "earlier").length;
  const retryable = legsToSign(flow.outputMints, signing.states, alreadyBought).length;
  const pendingUnknown = status === "partial" && displays.includes("submitted");

  const retry = () => {
    if (!request) return;
    Alert.alert(
      `Retry ${retryable} ${retryable === 1 ? "swap" : "swaps"}?`,
      "Builds fresh transactions for the swaps that didn’t go through and sends them. Assets you already bought are skipped. This can’t be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Retry",
          onPress: () => {
            setRetryError(null);
            flow.runPrepare(request, {
              carry: true,
              onDone: (data, carried) => {
                if (data.status !== "ready") {
                  setRetryError(tradeErrorMessage(data.error, data.message ?? "Couldn’t rebuild the swaps."));
                  return;
                }
                const total = data.transactions.length;
                const problems = data.transactions.flatMap((tx, index) =>
                  legBlocking(tx, bagData, index, total, auth.walletAddress),
                );
                if (problems.length > 0 || (data.walletAddress && data.walletAddress !== auth.walletAddress)) {
                  setRetryError(`Blocked for your safety. ${problems.join(" ")}`.trim());
                  return;
                }
                const indices = legsToSign(
                  data.transactions.map((tx) => tx.outputMint),
                  {},
                  carried,
                );
                signing.signAll(indices.map((index) => ({ index, transaction: data.transactions[index].transaction })));
              },
            });
          },
        },
      ],
    );
  };

  const viewPortfolio = () => {
    flow.close();
    setTimeout(() => router.navigate("/portfolio"), 350);
  };

  const heading =
    status === "complete"
      ? "Bag bought"
      : status === "partial"
        ? pendingUnknown && retryable === 0
          ? "Still confirming"
          : "Some swaps didn’t go through"
        : "Buying your bag…";
  const caption =
    status === "complete"
      ? "Every swap confirmed on-chain. Your portfolio shows the new balances."
      : status === "partial"
        ? pendingUnknown && retryable === 0
          ? "Solana hasn’t confirmed every swap yet. Check the explorer links or your portfolio in a moment."
          : `${done} of ${displays.length} confirmed. Retry only buys what’s missing.`
        : `${done} of ${displays.length} confirmed · signing and sending every swap`;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View
            style={[
              styles.badge,
              status === "complete" && styles.badgeDone,
              status === "partial" && styles.badgeWarn,
            ]}
          >
            {status === "complete" ? (
              <Ionicons name="checkmark" size={30} color={theme.ds.onAccent} />
            ) : status === "partial" ? (
              <Ionicons name="alert" size={30} color={theme.ds.onAccent} />
            ) : (
              <ActivityIndicator color={theme.ds.onAccent} />
            )}
          </View>
          <T variant="title2" align="center" accessibilityRole="header" accessibilityLiveRegion="polite">
            {heading}
          </T>
          <T variant="footnote" tone="secondary" align="center">
            {caption}
          </T>
        </View>

        <Card padded={false}>
          {ready.transactions.map((tx, index) => {
            const state = signing.states[index];
            return (
              <View key={`${flow.preparedAt}-${index}`}>
                {index > 0 ? <Divider inset={58} /> : null}
                <LegRow
                  tx={tx}
                  bag={bagData}
                  status={displays[index]}
                  error={state?.status === "failed" ? state.error : undefined}
                  signature={legSignature(state)}
                />
              </View>
            );
          })}
          <Divider />
          <View style={styles.total}>
            <T variant="subhead" style={[styles.flex, styles.bold]}>
              Total
            </T>
            <T variant="numeric">
              {formatMoney(totalInput(ready.transactions).toString(), USDC_DECIMALS)} USDC
            </T>
          </View>
        </Card>

        {retryError || prepare.isError ? (
          <Notice tone="error">
            <T variant="footnote" tone="danger">
              {retryError ?? prepare.error?.message}
            </T>
          </Notice>
        ) : null}
      </ScrollView>

      {status === "running" ? null : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          {status === "complete" ? (
            <PrimaryButton label="View portfolio" onPress={viewPortfolio} />
          ) : retryable > 0 ? (
            <PrimaryButton
              label={`Retry failed · ${retryable}`}
              icon="refresh"
              onPress={retry}
              loading={prepare.isPending}
            />
          ) : null}
          <PrimaryButton label="Done" variant="ghost" size="md" onPress={flow.close} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1 },
  content: {
    gap: theme.density.stack,
    paddingHorizontal: theme.density.gutter,
    paddingTop: 12,
    paddingBottom: 16,
  },
  flex: { flex: 1 },
  bold: { fontWeight: "600" },
  hero: { alignItems: "center", gap: 6, paddingVertical: 8 },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accent,
    marginBottom: 6,
  },
  badgeDone: { backgroundColor: theme.ds.positive },
  badgeWarn: { backgroundColor: theme.ds.caution },
  total: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.density.card,
    paddingVertical: 12,
  },
  footer: { paddingHorizontal: theme.density.gutter, paddingTop: 8, gap: 4 },
}));
