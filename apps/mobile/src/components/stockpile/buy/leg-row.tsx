import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Pill } from "@/components/stockpile/layout";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { T } from "@/components/stockpile/type";
import { useMintDecimals } from "@/hooks/use-mint-decimals";
import { explorerTxUrl, inspectTransaction, USDC_DECIMALS } from "@/lib/solana/transaction";
import { impactLevel, impactPercent, legLabelProblems } from "@/lib/trade/legs";
import type { LegDisplayStatus } from "@/lib/trade/purchase";
import type { Bag, PreparedTransaction } from "@/services/api/types";
import { formatMoney, formatTokenAmount } from "@/utils/amounts";
import { ImpactLabel } from "./controls";

/** Everything that blocks signing a leg: decode errors, unsafe instructions, label mismatches. */
export function legBlocking(
  tx: PreparedTransaction,
  bag: Bag,
  index: number,
  total: number,
  walletAddress: string | null,
): string[] {
  let errors: string[];
  try {
    errors = inspectTransaction(tx.transaction, walletAddress).errors;
  } catch (error) {
    errors = [error instanceof Error ? error.message : "Could not decode transaction"];
  }
  return [...errors, ...legLabelProblems(tx, bag, index, total)];
}

/** Formats a raw token amount with the leg's decimals, looking them up only when the API lacked them. */
export function TokenAmount({ tx, raw }: { tx: PreparedTransaction; raw: string }) {
  const decimals = useMintDecimals(tx.outputDecimals == null ? [tx.outputMint] : []);
  const value = tx.outputDecimals ?? decimals.data?.[tx.outputMint];
  return <>{value != null ? formatTokenAmount(raw, value, tx.uiAmountMultiplier) : `${raw} units`}</>;
}

export function LegStatusPill({ status }: { status: LegDisplayStatus }) {
  switch (status) {
    case "signing":
      return <Pill label="Signing" />;
    case "submitted":
      return <Pill label="Submitted" tone="accent" />;
    case "confirmed":
      return <Pill label="Confirmed" tone="positive" icon="checkmark-circle" />;
    case "earlier":
      return <Pill label="Bought earlier" tone="positive" icon="checkmark-circle" />;
    case "failed":
      return <Pill label="Failed" tone="caution" icon="alert-circle" />;
    default:
      return <Pill label="Queued" />;
  }
}

/** One dense row per leg: avatar, symbol, estimate, and either an amount or a status on the right. */
export function LegRow({
  tx,
  bag,
  status,
  error,
  signature,
}: {
  tx: PreparedTransaction;
  bag: Bag;
  /** Progress mode when set; review mode shows the estimated tokens out instead. */
  status?: LegDisplayStatus;
  error?: string;
  signature?: string;
}) {
  const { theme } = useUnistyles();
  const asset = bag.assets.find((candidate) => candidate.mint === tx.outputMint);
  const level = impactLevel(tx.priceImpactPct);
  return (
    <View style={styles.row}>
      <TokenAvatar symbol={tx.symbol} iconUrl={asset?.iconUrl} mint={tx.outputMint} size={32} />
      <View style={styles.middle}>
        <View style={styles.titleLine}>
          <T variant="subhead" style={styles.bold} numberOfLines={1}>
            {tx.symbol}
          </T>
          {status ? null : <ImpactLabel level={level} impact={impactPercent(tx.priceImpactPct)} />}
        </View>
        {status && error ? (
          <T variant="caption" tone="danger" numberOfLines={2}>
            {error}
          </T>
        ) : (
          <T variant="caption" tone="tertiary" numberOfLines={1}>
            ${formatMoney(tx.inputAmount, USDC_DECIMALS)} USDC
            {tx.minOutAmount ? (
              <>
                {" · min "}
                <TokenAmount tx={tx} raw={tx.minOutAmount} />
              </>
            ) : null}
          </T>
        )}
      </View>
      {status ? (
        <View style={styles.status}>
          {status === "signing" || status === "submitted" ? (
            <ActivityIndicator size="small" color={theme.ds.accent} />
          ) : null}
          <LegStatusPill status={status} />
          {signature ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`View ${tx.symbol} transaction on Solscan`}
              hitSlop={8}
              onPress={() => WebBrowser.openBrowserAsync(explorerTxUrl(signature)).catch(() => {})}
            >
              <Ionicons name="open-outline" size={15} color={theme.ds.inkTertiary} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <T variant="numeric" style={styles.amount}>
          <TokenAmount tx={tx} raw={tx.outAmount} />
        </T>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bold: { fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: theme.density.card,
    paddingVertical: 9,
  },
  middle: { flex: 1, gap: 1 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  amount: { fontSize: 15 },
}));
