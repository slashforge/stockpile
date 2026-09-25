import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { bagTradable, researchOnlyReason } from "@/components/stockpile/bag-card";
import { Chip, SlippageControl } from "@/components/stockpile/buy/controls";
import { useBuyFlow } from "@/components/stockpile/buy/flow-context";
import { MessageState, Skeleton } from "@/components/stockpile/layout";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { UsdcLogo } from "@/components/stockpile/token-logos";
import { T } from "@/components/stockpile/type";
import Numpad from "@/components/ui/numpad";
import {
  type AmountKey,
  applyAmountKey,
  clampAmountDecimals,
  formatAmountInput,
} from "@/lib/trade/amount-input";
import { tradeErrorMessage } from "@/lib/trade/legs";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatBaseUnits, formatMoney } from "@/utils/amounts";

const PRESETS = ["10", "25", "50", "100"];

export default function BuyAmountScreen() {
  const flow = useBuyFlow();
  const auth = useStockpileAuth();
  const insets = useSafeAreaInsets();
  const {
    bag,
    balance,
    amountInput,
    amountPending,
    amount,
    insufficient,
    needsFunds,
    request,
    prepare,
    prepared,
  } = flow;

  const bottom = { paddingBottom: insets.bottom + 8 };

  if (!bag.data) {
    return (
      <View style={[styles.root, bottom]}>
        {bag.isError ? (
          <MessageState
            tone="error"
            icon="alert-circle-outline"
            title="Bag unavailable"
            body={bag.error.message}
          />
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
        <MessageState icon="person-circle" title="Sign in to continue" body="Sign in to put money in this bag." />
      </View>
    );
  }
  if (!bagTradable(bag.data)) {
    return (
      <View style={[styles.root, bottom]}>
        <MessageState
          icon="lock-closed"
          title="Not open for buying yet"
          body={researchOnlyReason(bag.data)}
          actionLabel="Close"
          onAction={flow.close}
        />
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

  const setAmount = (next: string) => {
    flow.setAmount(next);
    prepare.reset();
  };
  const pressKey = (key: AmountKey) => setAmount(applyAmountKey(amountInput, key));

  const review = async () => {
    if (!request || insufficient) return;
    // The bag may still be the list's placeholder (possibly from an older catalogue). The review
    // screen validates every swap against the bag's assets, so always build against a fresh copy.
    if (bag.isPlaceholderData || bag.isError) {
      const fresh = await bag.refetch();
      if (!fresh.data) return;
    }
    flow.runPrepare(request, {
      onDone: (data) => {
        if (data.status === "ready" && data.transactions.length > 0) {
          router.push({ pathname: "/buy/[bagId]/review", params: { bagId: flow.bagId } });
        }
      },
    });
  };

  const balanceText =
    balance.status === "known"
      ? `${formatMoney(balance.raw.toString(), balance.decimals)} USDC available`
      : balance.reason;
  const unavailable =
    !prepare.isPending &&
    prepared?.status === "unavailable" &&
    prepared.amount === amount &&
    prepared.slippageBps === flow.slippageBps
      ? tradeErrorMessage(prepared.error, prepared.message ?? "The swaps couldn’t be built right now.")
      : null;
  const error = prepare.isError
    ? prepare.error.message
    : bag.isError && bag.isPlaceholderData
      ? "Couldn’t refresh this bag. Check your connection and try again."
      : unavailable;

  const heroText = amountPending ? "—" : `$${formatAmountInput(amountInput)}`;

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
          style={[styles.heroAmount, heroSize(heroText), !amount && styles.heroEmpty]}
          numberOfLines={1}
          accessibilityLabel={amountPending ? "Amount loading" : `Amount ${formatAmountInput(amountInput)} USDC`}
          testID="Amount in USDC"
        >
          {heroText}
        </T>
        <View style={styles.balanceLine}>
          <UsdcLogo size={14} />
          <T
            variant="footnote"
            tone={insufficient ? "danger" : "tertiary"}
            align="center"
            numberOfLines={2}
            style={styles.shrink}
          >
            {balance.status === "known" && balance.raw === 0n
              ? "No USDC yet. Send USDC on Solana to your wallet."
              : insufficient
                ? `More than your ${balanceText}`
                : balanceText}
          </T>
          {balance.status === "known" && balance.raw > 0n ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use full USDC balance"
              hitSlop={10}
              onPress={() =>
                setAmount(
                  clampAmountDecimals(
                    formatBaseUnits(balance.raw.toString(), balance.decimals, balance.decimals),
                  ),
                )
              }
            >
              <T variant="footnote" tone="accent" style={styles.bold}>
                Max
              </T>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.presets}>
        {PRESETS.map((preset) => (
          <Chip
            key={preset}
            compact
            label={`$${preset}`}
            selected={amountInput === preset}
            onPress={() => setAmount(preset)}
          />
        ))}
      </View>
      <Numpad onPress={pressKey} onBackspace={() => pressKey("delete")} onClear={() => setAmount("")} />
      {error ? (
        <T variant="footnote" tone="danger" align="center" numberOfLines={3}>
          {error}
        </T>
      ) : null}
      {needsFunds ? (
        <PrimaryButton label="Add USDC" icon="add-circle" onPress={flow.addFunds} />
      ) : (
        <PrimaryButton
          label="Review"
          onPress={review}
          disabled={!request}
          loading={prepare.isPending || (bag.isPlaceholderData && bag.isFetching)}
        />
      )}
    </View>
  );
}

// Fixed steps instead of `adjustsFontSizeToFit`: inside a height-constrained flex column iOS
// shrinks auto-fit text far below `minimumFontScale`, leaving a dot where the amount should be.
function heroSize(text: string) {
  if (text.length <= 6) return { fontSize: 72, lineHeight: 84, letterSpacing: -2.5 };
  if (text.length <= 9) return { fontSize: 56, lineHeight: 68, letterSpacing: -2 };
  return { fontSize: 42, lineHeight: 52, letterSpacing: -1.2 };
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    gap: theme.density.stack,
    paddingHorizontal: theme.density.gutter,
    paddingTop: 4,
  },
  loading: { gap: theme.density.stack, paddingTop: 24, alignItems: "center" },
  bold: { fontWeight: "600" },
  shrink: { flexShrink: 1 },
  hero: {
    flexGrow: 1,
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
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
}));
