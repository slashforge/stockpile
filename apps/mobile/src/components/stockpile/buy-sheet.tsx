import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { bagTradable } from "@/components/stockpile/bag-card";
import { LogoCluster } from "@/components/stockpile/bag-art";
import { Card, Divider, MessageState, Notice, Pill, Skeleton } from "@/components/stockpile/layout";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { T } from "@/components/stockpile/type";
import { usePortfolio } from "@/hooks/use-account";
import { useBag } from "@/hooks/use-bags";
import { useMintDecimals } from "@/hooks/use-mint-decimals";
import { type LegSigningState, useLegSigning, usePrepareTrade, useTradeQuote } from "@/hooks/use-trade";
import { explorerTxUrl, inspectTransaction, USDC_DECIMALS, USDC_MINT } from "@/lib/solana/transaction";
import { exceedsBalance, spendableUsdc } from "@/lib/trade/balance";
import {
  highImpactLegs,
  IMPACT_CONFIRM_PCT,
  impactLevel,
  impactPercent,
  legLabelProblems,
  totalInput,
  tradeErrorMessage,
} from "@/lib/trade/legs";
import { isPreIpoBag, PRE_IPO_REVIEW_NOTE } from "@/lib/pre-ipo";
import { canSignLeg, isPreparedExpired, legSignature, tradeProgress } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import type { Bag, PreparedTrade, PreparedTransaction, TradeQuote, TradeRequest } from "@/services/api/types";
import Numpad from "@/components/ui/numpad";
import { type AmountKey, applyAmountKey, clampAmountDecimals, formatAmountInput } from "@/lib/trade/amount-input";
import { formatBaseUnits, formatBps, formatMoney, formatTokenAmount, shortAddress, toBaseUnits } from "@/utils/amounts";
import { NativeSheet } from "./native-sheet";
import { useSignInSheet } from "./sign-in-sheet";

const PRESETS = ["10", "25", "50", "100"];
const SLIPPAGE_OPTIONS = [
  { bps: 50, label: "0.5%" },
  { bps: 100, label: "1%" },
  { bps: 300, label: "3%" },
];

function Chip({
  label,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  chipStyles.useVariants({ selected, compact });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={compact ? 6 : undefined}
      style={({ pressed }) => [chipStyles.chip, pressed && chipStyles.pressed]}
    >
      <T variant={compact ? "footnote" : "subhead"} style={chipStyles.label}>
        {label}
      </T>
    </Pressable>
  );
}

/** Slippage is a setting, not a step: a small toggle that reveals the options. */
function SlippageControl({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (bps: number) => void;
  disabled?: boolean;
}) {
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.slippage}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Slippage ${formatBps(value)}`}
        accessibilityHint="Shows slippage options"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.slippageToggle, pressed && chipStyles.pressed]}
      >
        <Ionicons name="options-outline" size={15} color={theme.ds.inkSecondary} />
        <T variant="footnote" tone="secondary" style={styles.bold}>
          Slippage {formatBps(value)}
        </T>
      </Pressable>
      {open ? (
        <View style={styles.slippagePanel}>
          {SLIPPAGE_OPTIONS.map((option) => (
              <Chip
                key={option.bps}
                compact
                label={option.label}
                selected={value === option.bps}
                onPress={() => {
                  onChange(option.bps);
                  setOpen(false);
                }}
              />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Numbered step with a vertical rhythm shared by all three trade stages. */
function Step({
  number,
  title,
  caption,
  state = "active",
  children,
}: {
  number: number;
  title: string;
  caption?: string;
  state?: "active" | "done";
  children: React.ReactNode;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.step}>
      <View style={styles.stepHeader}>
        <View style={[styles.stepBadge, state === "done" && styles.stepBadgeDone]}>
          {state === "done" ? (
            <Ionicons name="checkmark" size={14} color={theme.ds.onAccent} />
          ) : (
            <T variant="caption" tone="onAccent" style={styles.stepNumber}>
              {number}
            </T>
          )}
        </View>
        <View style={styles.flex}>
          <T variant="title3" accessibilityRole="header">
            {title}
          </T>
          {caption ? (
            <T variant="footnote" tone="secondary">
              {caption}
            </T>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function useAssetForMint(bag: Bag) {
  return useMemo(() => {
    const map = new Map(bag.assets.filter((a) => a.mint).map((a) => [a.mint as string, a]));
    return (mint: string) => {
      const asset = map.get(mint);
      return { symbol: asset?.symbol ?? shortAddress(mint), iconUrl: asset?.iconUrl ?? null };
    };
  }, [bag]);
}

function ImpactLabel({ level, impact }: { level: ReturnType<typeof impactLevel>; impact: number | null }) {
  const { theme } = useUnistyles();
  if (impact == null) {
    return (
      <T variant="caption" tone="tertiary">
        Price impact unavailable
      </T>
    );
  }
  if (level === "ok") {
    return (
      <T variant="caption" tone="tertiary">
        {impact.toFixed(2)}% price impact
      </T>
    );
  }
  const color = level === "high" ? theme.ds.danger : theme.ds.caution;
  return (
    <View
      style={styles.impact}
      accessibilityLabel={`${level === "high" ? "Very high" : "High"} price impact, ${impact.toFixed(2)} percent. Thin liquidity.`}
    >
      <Ionicons name="warning" size={12} color={color} />
      <T variant="caption" style={[styles.bold, { color }]}>
        {impact.toFixed(2)}% price impact · thin liquidity
      </T>
    </View>
  );
}

function QuoteCard({ bag, quote }: { bag: Bag; quote: TradeQuote }) {
  const assetFor = useAssetForMint(bag);
  // The API now reports decimals; only look up mints it couldn't resolve.
  const decimals = useMintDecimals(quote.legs.filter((leg) => leg.outputDecimals == null).map((leg) => leg.outputMint));

  if (quote.status === "unavailable") {
    return (
      <MessageState
        tone="error"
        icon="alert-circle-outline"
        title="Quote unavailable"
        body={tradeErrorMessage(quote.error, quote.message ?? "Jupiter couldn’t route this bag right now.")}
      />
    );
  }

  return (
    <Card padded={false}>
      {quote.legs.map((leg, index) => {
        const outDecimals = leg.outputDecimals ?? decimals.data?.[leg.outputMint];
        const impact = impactPercent(leg.priceImpactPct);
        const level = impactLevel(leg.priceImpactPct);
        const asset = assetFor(leg.outputMint);
        return (
          <View key={`${leg.outputMint}-${index}`}>
            {index > 0 ? <Divider inset={16} /> : null}
            <View style={styles.legRow}>
              <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} size={36} />
              <View style={styles.flex}>
                <T variant="headline">{asset.symbol}</T>
                <T variant="footnote" tone="secondary">
                  {formatBaseUnits(leg.inputAmount, USDC_DECIMALS)} USDC in
                </T>
                <ImpactLabel level={level} impact={impact} />
              </View>
              <View style={styles.alignEnd}>
                <T variant="numeric">
                  {outDecimals != null
                    ? `≈ ${formatTokenAmount(leg.outAmount, outDecimals, leg.uiAmountMultiplier)}`
                    : `${leg.outAmount} units`}
                </T>
                <T variant="caption" tone="tertiary">
                  {outDecimals != null ? "est. tokens out" : "raw units (decimals unavailable)"}
                </T>
              </View>
            </View>
          </View>
        );
      })}
      {quote.legs.some((leg) => impactLevel(leg.priceImpactPct) !== "ok") ? (
        <View style={styles.impactNote}>
          <T variant="footnote" tone="secondary">
            Some tokens have thin liquidity, so part of your money is lost to price impact. Try a different amount
            or a new quote.
          </T>
        </View>
      ) : null}
      <Divider inset={16} />
      <View style={styles.legRow}>
        <T variant="subhead" style={styles.flex}>
          Total
        </T>
        <T variant="numeric">{formatBaseUnits(totalInput(quote.legs).toString(), USDC_DECIMALS)} USDC</T>
      </View>
    </Card>
  );
}

function statusPill(state: LegSigningState | undefined) {
  switch (state?.status) {
    case "signing":
      return <Pill label="Waiting for wallet" />;
    case "submitted":
      return <Pill label="Submitted" tone="accent" />;
    case "confirmed":
      return <Pill label="Confirmed" tone="positive" icon="checkmark-circle" />;
    case "failed":
      return <Pill label="Failed" tone="caution" />;
    default:
      return <Pill label="Not signed" />;
  }
}

function MinOut({ tx, raw }: { tx: PreparedTransaction; raw: string }) {
  const decimals = useMintDecimals(tx.outputDecimals == null ? [tx.outputMint] : []);
  const value = tx.outputDecimals ?? decimals.data?.[tx.outputMint];
  return <>{value != null ? formatTokenAmount(raw, value, tx.uiAmountMultiplier) : `${raw} units`}</>;
}

function TransactionCard({
  index,
  total,
  tx,
  bag,
  walletAddress,
  state,
  expired,
  onSign,
}: {
  index: number;
  total: number;
  tx: PreparedTransaction;
  bag: Bag;
  walletAddress: string | null;
  state: LegSigningState | undefined;
  expired: boolean;
  onSign: () => void;
}) {
  const { theme } = useUnistyles();
  const [expanded, setExpanded] = useState(false);
  const base64 = tx.transaction;
  const summary = useMemo(() => {
    try {
      return inspectTransaction(base64, walletAddress);
    } catch (error) {
      return error instanceof Error ? error : new Error("Could not decode transaction");
    }
  }, [base64, walletAddress]);
  const asset = bag.assets.find((candidate) => candidate.mint === tx.outputMint);
  const labelProblems = legLabelProblems(tx, bag, index, total);

  const decodeError = summary instanceof Error ? summary.message : null;
  const blocking = [
    ...(decodeError ? [decodeError] : (summary as Exclude<typeof summary, Error>).errors),
    ...labelProblems,
  ];
  const busy = state?.status === "signing" || state?.status === "submitted";
  const signature = legSignature(state);
  // Anything already broadcast (even if it failed on-chain) is never re-sent; rebuild instead.
  const done = !canSignLeg(state) && state?.status !== "signing";

  return (
    <Card>
      <View style={styles.txHeader}>
        <TokenAvatar symbol={tx.symbol} iconUrl={asset?.iconUrl} size={40} />
        <View style={styles.flex}>
          <T variant="caption" tone="tertiary" style={styles.bold}>
            Step {index + 1} of {total}
          </T>
          <T variant="headline">
            {formatBaseUnits(tx.inputAmount, USDC_DECIMALS)} USDC → {tx.symbol}
          </T>
          {impactLevel(tx.priceImpactPct) === "warn" || impactLevel(tx.priceImpactPct) === "high" ? (
            <ImpactLabel level={impactLevel(tx.priceImpactPct)} impact={impactPercent(tx.priceImpactPct)} />
          ) : null}
          {tx.minOutAmount ? (
            <T variant="footnote" tone="secondary">
              At least <MinOut tx={tx} raw={tx.minOutAmount} /> {tx.symbol} after slippage
            </T>
          ) : null}
        </View>
        {statusPill(state)}
      </View>

      {summary instanceof Error ? null : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Hide transaction details" : "Show transaction details"}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={styles.inspectToggle}
          >
            <T variant="footnote" tone="secondary" style={styles.flex}>
              {summary.instructionCount} instructions · {summary.programs.length} programs · fee payer{" "}
              {shortAddress(summary.feePayer)}
            </T>
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={theme.ds.inkTertiary} />
          </Pressable>
          {expanded ? (
            <View style={styles.inspect}>
              {summary.programs.map((program) => (
                <T key={program.id} variant="footnote" tone="secondary">
                  {program.label ?? "Unrecognised program"} · {shortAddress(program.id)}
                </T>
              ))}
              <T variant="footnote" tone="tertiary">
                Version {String(summary.version)} · {summary.addressLookupTables} lookup tables · {summary.sizeBytes}{" "}
                bytes
              </T>
            </View>
          ) : null}
          {summary.warnings.map((warning) => (
            <T key={warning} variant="caption" tone="caution">
              {warning}
            </T>
          ))}
        </>
      )}

      {blocking.length > 0 ? (
        <Notice tone="error">
          {blocking.map((error) => (
            <T key={error} variant="footnote" tone="danger">
              {error}
            </T>
          ))}
          <T variant="footnote" tone="danger" style={styles.bold}>
            Signing is blocked for your safety.
          </T>
        </Notice>
      ) : null}

      {state?.status === "failed" ? (
        <T variant="footnote" tone="danger">
          {state.error}
        </T>
      ) : null}

      {signature ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => WebBrowser.openBrowserAsync(explorerTxUrl(signature))}
          style={styles.explorer}
        >
          <T variant="footnote" tone="accent" style={styles.bold}>
            View on Solscan · {shortAddress(signature, 6)}
          </T>
        </Pressable>
      ) : null}

      {!done ? (
        <PrimaryButton
          label={state?.status === "failed" ? "Try signing again" : "Review & sign"}
          variant={index === 0 || state?.status === "failed" ? "solid" : "outline"}
          size="md"
          loading={busy}
          disabled={blocking.length > 0 || expired}
          onPress={onSign}
        />
      ) : state?.status === "submitted" ? (
        <View style={styles.pending}>
          <ActivityIndicator color={theme.ds.accent} />
          <T variant="footnote" tone="secondary">
            Waiting for confirmation…
          </T>
        </View>
      ) : null}
    </Card>
  );
}

function TradeFlow({ bag }: { bag: Bag }) {
  const auth = useStockpileAuth();
  const [amountInput, setAmountInput] = useState("25");
  const [slippageBps, setSlippageBps] = useState(100);
  const quote = useTradeQuote();
  const prepare = usePrepareTrade();
  const signing = useLegSigning();
  const [preparedAt, setPreparedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const portfolio = usePortfolio();
  const balance = spendableUsdc(portfolio.data);
  const amount = toBaseUnits(amountInput, USDC_DECIMALS);
  const insufficient = exceedsBalance(amount, balance);
  // Quotes are indicative and allowed without funds; building signable transactions is not.
  const request: TradeRequest | null = amount
    ? { bagId: bag.id, inputMint: USDC_MINT, amount, slippageBps }
    : null;
  const requestKey = request ? `${request.amount}:${request.slippageBps}` : null;
  const quotedKey = quote.variables ? `${quote.variables.amount}:${quote.variables.slippageBps}` : null;
  const quoteStale = !!quote.data && quotedKey !== requestKey;

  const prepared: PreparedTrade | undefined = prepare.data;
  const walletMismatch =
    prepared?.status === "ready" && !!prepared.walletAddress && prepared.walletAddress !== auth.walletAddress;
  const expired = isPreparedExpired(preparedAt, now);
  const progress = tradeProgress(
    prepared?.status === "ready" ? prepared.transactions.length : 0,
    signing.states,
  );
  const signingStarted = progress.started;
  const allConfirmed = progress.allConfirmed;

  useEffect(() => {
    if (preparedAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [preparedAt]);

  const resetDownstream = () => {
    prepare.reset();
    signing.reset();
    setPreparedAt(null);
  };

  const getQuote = () => {
    if (!request) return;
    resetDownstream();
    quote.mutate(request);
  };

  const anySent = progress.anySent;

  const doPrepare = () => {
    if (!request || insufficient) return;
    const risky = quote.data && !quoteStale ? highImpactLegs(quote.data.legs) : [];
    if (risky.length > 0 && !anySent) {
      Alert.alert(
        "High price impact",
        `${risky
          .map((leg) => `${leg.symbol}: ${impactPercent(leg.priceImpactPct)?.toFixed(2)}%`)
          .join("\n")}\n\nThese tokens have thin liquidity, so you would lose more than ${IMPACT_CONFIRM_PCT}% to price impact on them. Consider a different amount.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue anyway", style: "destructive", onPress: () => runPrepare(request) },
        ],
      );
      return;
    }
    if (anySent) {
      Alert.alert(
        "Some transactions already went through",
        "Rebuilding creates a completely new set of transactions for the whole bag amount, which may repeat purchases you already made. Only sign what you still want.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Rebuild", onPress: () => runPrepare(request) },
        ],
      );
      return;
    }
    runPrepare(request);
  };

  const runPrepare = (next: TradeRequest) => {
    signing.reset();
    prepare.mutate(next, {
      onSuccess: () => {
        setPreparedAt(Date.now());
        setNow(Date.now());
      },
    });
  };

  const confirmAndSign = (index: number, tx: PreparedTransaction) => {
    const total = prepared?.transactions.length ?? 0;
    Alert.alert(
      `Approve step ${index + 1} of ${total}?`,
      `Swap ${formatBaseUnits(tx.inputAmount, USDC_DECIMALS)} USDC for ${tx.symbol}.${
        impactLevel(tx.priceImpactPct) === "ok" || impactLevel(tx.priceImpactPct) === "unknown"
          ? ""
          : ` Price impact is ${impactPercent(tx.priceImpactPct)?.toFixed(2)}% (thin liquidity).`
      } Your wallet will sign this transaction and submit it to Solana. The amount you receive can differ from the quote within your ${
        slippageBps / 100
      }% slippage limit. This can’t be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign & send", style: "default", onPress: () => signing.signLeg(index, tx.transaction) },
      ],
    );
  };

  if (!auth.walletAddress) {
    return (
      <MessageState
        icon="wallet-outline"
        title="Setting up your wallet"
        body="Your Solana wallet isn't ready yet. This usually takes a few seconds after your first sign-in."
      />
    );
  }

  const quoted = !!quote.data && !quoteStale;
  const locked = signingStarted;

  const setAmount = (next: string) => {
    setAmountInput(next);
    resetDownstream();
  };
  const pressKey = (key: AmountKey) => {
    if (locked) return;
    setAmount(applyAmountKey(amountInput, key));
  };
  const changeSlippage = (bps: number) => {
    if (locked) return;
    setSlippageBps(bps);
    resetDownstream();
  };

  const balanceText =
    balance.status === "known" ? `${formatMoney(balance.raw.toString(), balance.decimals)} USDC available` : balance.reason;

  if (!quoted) {
    return (
      <View style={styles.amountStage}>
        <SlippageControl value={slippageBps} onChange={changeSlippage} disabled={locked} />
        <View style={styles.hero}>
          <T
            style={[styles.heroAmount, !amount && styles.heroEmpty]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            accessibilityLabel={`Amount ${formatAmountInput(amountInput)} USDC`}
            testID="Amount in USDC"
          >
            ${formatAmountInput(amountInput)}
          </T>
          <View style={styles.balanceLine}>
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
                  setAmount(clampAmountDecimals(formatBaseUnits(balance.raw.toString(), balance.decimals, balance.decimals)))
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
              onPress={() => !locked && setAmount(preset)}
            />
          ))}
        </View>
        <Numpad onPress={pressKey} onBackspace={() => pressKey("delete")} onClear={() => !locked && setAmount("")} />
        {quote.isError ? (
          <T variant="footnote" tone="danger" align="center">
            {quote.error.message}
          </T>
        ) : null}
        <PrimaryButton label="Get quote" onPress={getQuote} disabled={!request || insufficient} loading={quote.isPending} />
      </View>
    );
  }

  return (
    <>
      <Card style={styles.summary}>
        <View style={styles.summaryRow}>
          <View style={styles.flex}>
            <T variant="caption" tone="tertiary">
              You put in
            </T>
            <T variant="title2">${formatAmountInput(amountInput)} USDC</T>
          </View>
          {!locked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change amount"
              hitSlop={10}
              onPress={() => {
                quote.reset();
                resetDownstream();
              }}
              style={styles.changeButton}
            >
              <T variant="subhead" tone="accent" style={styles.bold}>
                Change
              </T>
            </Pressable>
          ) : null}
        </View>
        <SlippageControl value={slippageBps} onChange={changeSlippage} disabled={locked} />
      </Card>
      {quoted && quote.data ? (
        <Step
          number={1}
          title="Check the quote"
          caption="Indicative Jupiter routes. Prices keep moving until you sign."
          state={prepared ? "done" : "active"}
        >
          <QuoteCard bag={bag} quote={quote.data} />
          {quote.data.status === "available" && !prepared ? (
            <>
              <PrimaryButton
                label={insufficient ? "Add USDC to continue" : "Review & build transactions"}
                onPress={doPrepare}
                loading={prepare.isPending}
                disabled={insufficient}
              />
              <PrimaryButton
                label="Refresh quote"
                variant="ghost"
                size="md"
                icon="refresh"
                onPress={getQuote}
                disabled={quote.isPending}
              />
            </>
          ) : null}
          {prepare.isError ? (
            <Notice tone="error">
              <T variant="footnote" tone="danger">
                {prepare.error.message}
              </T>
            </Notice>
          ) : null}
        </Step>
      ) : null}

      {prepared ? (
        <Step
          number={2}
          title="Review & sign"
          caption="This purchase is a set of transactions without per-asset labels; together they make up the quoted bag. Approve each one separately. Any you skip won't be sent."
          state={allConfirmed ? "done" : "active"}
        >
          {isPreIpoBag(bag) ? (
            <Notice tone="caution" icon="hourglass-outline">
              <T variant="footnote" tone="caution">
                {PRE_IPO_REVIEW_NOTE}
              </T>
            </Notice>
          ) : null}
          {prepared.status === "unavailable" ? (
            <MessageState
              tone="error"
              icon="alert-circle-outline"
              title="Couldn't build transactions"
              body={tradeErrorMessage(prepared.error, prepared.message ?? "The swaps couldn’t be built, so nothing was prepared.")}
              actionLabel="Try again"
              onAction={doPrepare}
            />
          ) : walletMismatch ? (
            <Notice tone="error">
              <T variant="footnote" tone="danger">
                These transactions were built for {shortAddress(prepared.walletAddress ?? "")}, which isn’t your
                signed-in wallet ({shortAddress(auth.walletAddress)}). Signing is blocked.
              </T>
            </Notice>
          ) : (
            <>
              {expired && !allConfirmed ? (
                <Notice tone="caution">
                  <T variant="footnote" tone="caution">
                    Unsigned transactions have likely expired. Rebuild them to get fresh prices and a new blockhash.
                  </T>
                  <PrimaryButton
                    label="Rebuild transactions"
                    variant="outline"
                    size="md"
                    onPress={doPrepare}
                    loading={prepare.isPending}
                  />
                </Notice>
              ) : null}
              {prepared.transactions.map((tx, index) => (
                <TransactionCard
                  key={`${preparedAt}-${index}`}
                  index={index}
                  total={prepared.transactions.length}
                  tx={tx}
                  bag={bag}
                  walletAddress={auth.walletAddress}
                  state={signing.states[index]}
                  expired={expired}
                  onSign={() => confirmAndSign(index, tx)}
                />
              ))}
            </>
          )}
        </Step>
      ) : null}

      {allConfirmed ? (
        <Card style={styles.success}>
          <Pill label="All transactions confirmed" tone="positive" icon="checkmark-circle" />
          <T variant="callout" tone="secondary">
            Every transaction confirmed on-chain. Your Portfolio shows the resulting on-chain balances.
          </T>
          <PrimaryButton label="View portfolio" onPress={() => router.navigate("/portfolio")} />
        </Card>
      ) : null}

      <T variant="caption" tone="tertiary" align="center" style={styles.footnote}>
        Stockpile builds swaps with Jupiter but never signs or submits for you. Network fees are paid in SOL from
        your wallet. Not investment advice.
      </T>
    </>
  );
}

function BuySheetBody({ bagId, onClose }: { bagId: string; onClose: () => void }) {
  const { theme } = useUnistyles();
  const bag = useBag(bagId);
  const auth = useStockpileAuth();

  let body: React.ReactNode;
  if (!bag.data) {
    body = bag.isError ? (
      <MessageState tone="error" icon="alert-circle-outline" title="Bag unavailable" body={bag.error.message} />
    ) : (
      <View style={styles.loading}>
        <Skeleton height={28} width="70%" />
        <Skeleton height={140} radius={24} />
      </View>
    );
  } else if (!auth.authenticated) {
    body = (
      <MessageState icon="person-circle" title="Sign in to continue" body="Sign in to put money in this bag." />
    );
  } else if (!bagTradable(bag.data)) {
    body = (
      <MessageState
        icon="lock-closed"
        title="Not open for buying yet"
        body="Some tokens in this bag don’t have a verified Solana mint yet, so it’s research only for now."
        actionLabel="Close"
        onAction={onClose}
      />
    );
  } else {
    body = <TradeFlow bag={bag.data} />;
  }

  return (
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={styles.sheetContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sheetHeader}>
        <View style={styles.sheetTitle}>
          <T variant="title2" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            Put money in the bag
          </T>
          <View style={styles.sheetBagRow}>
            {bag.data ? <LogoCluster assets={bag.data.assets} size={20} limit={4} /> : null}
            <T variant="footnote" tone="secondary" numberOfLines={1} style={styles.sheetBagName}>
              {bag.data?.title ?? " "}
            </T>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={20} color={theme.ds.inkSecondary} />
        </Pressable>
      </View>
      {body}
    </ScrollView>
  );
}

type BuySheetValue = {
  /** Opens "Put money in the bag". Signed-out users are asked to sign in first, then land here. */
  openBuy: (bagId: string) => void;
};

const BuySheetContext = createContext<BuySheetValue>({ openBuy: () => {} });

export function useBuySheet() {
  return useContext(BuySheetContext);
}

export function BuySheetProvider({ children }: { children: React.ReactNode }) {
  const { requestSignIn } = useSignInSheet();
  const [bagId, setBagId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // New session per open so a previous quote or prepared set never carries over.
  const [session, setSession] = useState(0);

  const present = useCallback((id: string) => {
    setBagId(id);
    setSession((value) => value + 1);
    setOpen(true);
  }, []);

  const openBuy = useCallback(
    (id: string) => requestSignIn(() => present(id)),
    [requestSignIn, present],
  );

  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openBuy }), [openBuy]);

  return (
    <BuySheetContext.Provider value={value}>
      {children}
      <NativeSheet
        isPresented={open}
        onDismiss={close}
        testID="buy-sheet"
      >
        {/* Keep content mounted while the native sheet animates closed; swapping it mid-dismiss crashes Expo UI on Android. */}
        {bagId ? <BuySheetBody key={session} bagId={bagId} onClose={close} /> : <View />}
      </NativeSheet>
    </BuySheetContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1, gap: 2 },
  sheetContent: { flexGrow: 1, gap: 12, paddingTop: 4 },
  sheetScroll: { flex: 1 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 4 },
  sheetTitle: { flex: 1, gap: 6 },
  sheetBagRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetBagName: { flexShrink: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.sunken,
  },
  loading: { gap: 12 },
  impact: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  impactNote: { paddingHorizontal: 16, paddingBottom: 12 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  balanceIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accentSoft,
  },
  bold: { fontWeight: "600" },
  art: { ...theme.rounded(24) },
  header: { gap: 4, marginBottom: 4 },
  step: { gap: 12, marginTop: 12 },
  stepHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accent,
    marginTop: 1,
  },
  stepBadgeDone: { backgroundColor: theme.ds.mint },
  stepNumber: { fontWeight: "800", color: theme.ds.onAccent },
  legRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  alignEnd: { alignItems: "flex-end", gap: 2 },
  amountStage: { flexGrow: 1, gap: 16 },
  hero: { flexGrow: 1, minHeight: 150, alignItems: "center", justifyContent: "center", gap: 8 },
  heroAmount: {
    fontSize: 72,
    lineHeight: 84,
    fontWeight: "800",
    letterSpacing: -2.5,
    color: theme.ds.ink,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    alignSelf: "stretch",
  },
  heroEmpty: { color: theme.ds.inkTertiary },
  balanceLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  shrink: { flexShrink: 1 },
  presets: { flexDirection: "row", justifyContent: "center", gap: 8 },
  slippage: { alignSelf: "flex-end", alignItems: "flex-end", gap: 8 },
  slippageToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.ds.sunken,
  },
  slippagePanel: { flexDirection: "row", gap: 6 },
  summary: { gap: 12 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  changeButton: { minHeight: 36, justifyContent: "center" },
  txHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  inspectToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
  },
  inspect: {
    gap: 6,
    padding: 12,
    ...theme.rounded(12),
    backgroundColor: theme.ds.sunken,
  },
  explorer: { alignSelf: "flex-start", paddingVertical: 4 },
  pending: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  success: { backgroundColor: theme.ds.mintSoft },
  footnote: { marginTop: 12, paddingHorizontal: 12 },
}));

const chipStyles = StyleSheet.create((theme) => ({
  chip: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    borderWidth: 1,
    variants: {
      selected: {
        true: { backgroundColor: theme.ds.accent, borderColor: theme.ds.accent },
        false: { backgroundColor: theme.ds.surface, borderColor: theme.ds.lineStrong },
      },
      compact: {
        true: { minHeight: 32, minWidth: 52, paddingHorizontal: 12 },
        false: {},
      },
    },
  },
  pressed: { opacity: 0.75 },
  label: {
    fontWeight: "600",
    variants: {
      selected: {
        true: { color: theme.ds.onAccent },
        false: { color: theme.ds.ink },
      },
    },
  },
}));
