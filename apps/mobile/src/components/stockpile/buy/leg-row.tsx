import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Pill } from "@/components/stockpile/layout";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { T } from "@/components/stockpile/type";
import { useMintDecimals } from "@/hooks/use-mint-decimals";
import { explorerTxUrl, inspectTransaction, USDC_DECIMALS } from "@/lib/solana/transaction";
import { impactLevel, impactPercent, legAssetMint, legLabelProblems, type TradeSide } from "@/lib/trade/legs";
import type { LegDisplayStatus } from "@/lib/trade/purchase";
import type { Bag, PreparedTransaction, QuoteLeg } from "@/services/api/types";
import { formatMoney, formatTokenAmount } from "@/utils/amounts";
import { ImpactLabel } from "./controls";
import { HapticPressable } from "@/components/stockpile/haptic-pressable";

/** Everything that blocks signing a leg: decode errors, unsafe instructions, label mismatches. */
export function legBlocking(
  tx: PreparedTransaction,
  bag: Bag,
  index: number,
  total: number,
  walletAddress: string | null,
  side: TradeSide = "buy",
): string[] {
  let errors: string[];
  try {
    errors = inspectTransaction(tx.transaction, walletAddress).errors;
  } catch (error) {
    errors = [error instanceof Error ? error.message : "Could not decode transaction"];
  }
  return [...errors, ...legLabelProblems(tx, bag, index, total, side)];
}

/**
 * Formats a raw amount of the leg's bag token. Buys carry the decimals on the leg; sells (and legs
 * the API couldn't resolve) look them up on chain.
 */
export function TokenAmount({ tx, raw, side = "buy" }: { tx: QuoteLeg; raw: string; side?: TradeSide }) {
  const mint = legAssetMint(tx, side);
  const known = side === "buy" ? tx.outputDecimals : null;
  const decimals = useMintDecimals(known == null ? [mint] : []);
  const value = known ?? decimals.data?.[mint];
  return <>{value != null ? formatTokenAmount(raw, value, tx.uiAmountMultiplier) : `${raw} units`}</>;
}

export function LegStatusPill({ status, side = "buy" }: { status: LegDisplayStatus; side?: TradeSide }) {
  switch (status) {
    case "signing":
      return <Pill label="Signing" />;
    case "submitted":
      return <Pill label="Submitted" tone="accent" />;
    case "confirmed":
      return <Pill label="Confirmed" tone="positive" icon="checkmark-circle" />;
    case "earlier":
      return <Pill label={side === "sell" ? "Sold earlier" : "Bought earlier"} tone="positive" icon="checkmark-circle" />;
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
  side = "buy",
  linkFailed = false,
  onRetryLink,
}: {
  tx: QuoteLeg;
  bag: Bag;
  /** Progress mode when set; review mode shows the estimated tokens out instead. */
  status?: LegDisplayStatus;
  error?: string;
  signature?: string;
  side?: TradeSide;
  /** The confirmed swap couldn't be linked to the bag's position. */
  linkFailed?: boolean;
  onRetryLink?: () => void;
}) {
  const { theme } = useUnistyles();
  const mint = legAssetMint(tx, side);
  const asset = bag.assets.find((candidate) => candidate.mint === mint);
  const level = impactLevel(tx.priceImpactPct);
  const usdc = side === "sell" ? tx.outAmount : tx.inputAmount;
  return (
    <View style={styles.row}>
      <TokenAvatar symbol={tx.symbol} iconUrl={asset?.iconUrl} mint={mint} size={32} />
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
        ) : side === "sell" ? (
          <T variant="caption" tone="tertiary" numberOfLines={1}>
            Sell <TokenAmount tx={tx} raw={tx.inputAmount} side="sell" /> {tx.symbol}
            {tx.minOutAmount ? ` · min $${formatMoney(tx.minOutAmount, USDC_DECIMALS)}` : null}
          </T>
        ) : (
          <T variant="caption" tone="tertiary" numberOfLines={1}>
            ${formatMoney(usdc, USDC_DECIMALS)} USDC
            {tx.minOutAmount ? (
              <>
                {" · min "}
                <TokenAmount tx={tx} raw={tx.minOutAmount} />
              </>
            ) : null}
          </T>
        )}
        {linkFailed ? (
          <HapticPressable
            accessibilityRole="button"
            accessibilityLabel={`Couldn't link the ${tx.symbol} swap to the bag. Retry`}
            hitSlop={6}
            onPress={onRetryLink}
            disabled={!onRetryLink}
          >
            <T variant="caption" tone="tertiary" numberOfLines={1}>
              Couldn’t link this swap to the bag ·{" "}
              <T variant="caption" tone="accent" style={styles.bold}>
                Retry
              </T>
            </T>
          </HapticPressable>
        ) : null}
      </View>
      {status ? (
        <View style={styles.status}>
          {status === "signing" || status === "submitted" ? (
            <ActivityIndicator size="small" color={theme.ds.accent} />
          ) : null}
          <LegStatusPill status={status} side={side} />
          {signature ? (
            <HapticPressable
              accessibilityRole="link"
              accessibilityLabel={`View ${tx.symbol} transaction on Solscan`}
              hitSlop={8}
              onPress={() => WebBrowser.openBrowserAsync(explorerTxUrl(signature)).catch(() => {})}
            >
              <Ionicons name="open-outline" size={15} color={theme.ds.inkTertiary} />
            </HapticPressable>
          ) : null}
        </View>
      ) : side === "sell" ? (
        <T variant="numeric" style={styles.amount}>
          ${formatMoney(tx.outAmount, USDC_DECIMALS)}
        </T>
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
