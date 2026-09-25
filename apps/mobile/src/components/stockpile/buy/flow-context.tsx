import { router, useNavigation } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useFundSheet } from "@/components/stockpile/fund-sheet";
import { usePortfolio } from "@/hooks/use-account";
import { useBag } from "@/hooks/use-bags";
import { useLotRecorder } from "@/hooks/use-positions";
import { useLegSigning, usePrepareTrade } from "@/hooks/use-trade";
import { USDC_DECIMALS, USDC_MINT } from "@/lib/solana/transaction";
import { belowOneUnit, defaultBuyAmount, exceedsBalance, spendableUsdc } from "@/lib/trade/balance";
import { legAssetMint, type TradeSide } from "@/lib/trade/legs";
import { purchaseStatus } from "@/lib/trade/purchase";
import { boughtMints, isPreparedExpired, secondsUntilExpiry } from "@/lib/trade/signing";
import type { PreparedTrade, TradeRequest } from "@/services/api/types";
import { toBaseUnits } from "@/utils/amounts";

/**
 * Everything a buy or sell of a whole bag shares: one prepared set of per-leg transactions, their
 * signing, retries that skip legs already done, expiry, and linking confirmed swaps to the bag.
 */
export function useTradeFlowCore(bagId: string, side: TradeSide) {
  const navigation = useNavigation();
  const bag = useBag(bagId);
  const prepare = usePrepareTrade();
  const signing = useLegSigning(bagId);
  const lots = useLotRecorder(bagId);
  // null = automatic price protection (Jupiter's estimator); a number is the advanced override.
  const [slippageBps, setSlippageBps] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<PreparedTrade | null>(null);
  const [preparedAt, setPreparedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // Bag token mints traded in earlier prepared sets of this run (survives every rebuild).
  const [alreadyBought, setAlreadyBought] = useState<ReadonlySet<string>>(() => new Set());

  const assetMints = useMemo(
    () => (prepared?.status === "ready" ? prepared.transactions.map((tx) => legAssetMint(tx, side)) : []),
    [prepared, side],
  );
  const status = purchaseStatus(assetMints, signing.states, alreadyBought, signing.inFlight);

  useEffect(() => {
    if (preparedAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [preparedAt]);

  // Link every confirmed swap to the bag's position; earlier sets were linked when they confirmed.
  const { record } = lots;
  useEffect(() => {
    for (const state of Object.values(signing.states)) {
      if (state.status === "confirmed") record(state.signature);
    }
  }, [signing.states, record]);

  /** Builds a fresh signable set. `carry` keeps legs done so far so a retry never repeats them. */
  const runPrepare = useCallback(
    (
      next: TradeRequest,
      options: {
        carry?: boolean;
        onDone?: (data: PreparedTrade, alreadyBought: ReadonlySet<string>) => void;
      } = {},
    ) => {
      const carried = options.carry
        ? new Set([...alreadyBought, ...boughtMints(assetMints, signing.states)])
        : new Set<string>();
      prepare.mutate(next, {
        onSuccess: (data) => {
          signing.reset();
          setAlreadyBought(carried);
          setPrepared(data);
          setPreparedAt(Date.now());
          setNow(Date.now());
          options.onDone?.(data, carried);
        },
      });
    },
    [alreadyBought, assetMints, signing, prepare],
  );

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/");
  }, [navigation]);

  // No swipe-to-dismiss while swaps are being signed and sent.
  const running = status === "running";
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !running });
  }, [navigation, running]);

  return {
    side,
    bagId,
    bag,
    slippageBps,
    setSlippageBps,
    prepare,
    prepared,
    preparedAt,
    expired: isPreparedExpired(preparedAt, now),
    secondsLeft: secondsUntilExpiry(preparedAt, now),
    refreshClock: () => setNow(Date.now()),
    runPrepare,
    signing,
    alreadyBought,
    assetMints,
    status,
    close,
    lots,
  };
}

export type TradeFlowCore = ReturnType<typeof useTradeFlowCore>;

function useBuyFlowState(bagId: string) {
  const core = useTradeFlowCore(bagId, "buy");
  const portfolio = usePortfolio();
  const { openFund } = useFundSheet();

  // null until the user edits: until then the amount follows the balance-based default.
  const [editedAmount, setEditedAmount] = useState<string | null>(null);

  const balance = spendableUsdc(portfolio.data);
  const balanceSettled = !!portfolio.data || portfolio.isError;
  const amountInput = editedAmount ?? (balanceSettled ? defaultBuyAmount(balance) : "");
  const amountPending = editedAmount == null && !balanceSettled;
  const amount = toBaseUnits(amountInput, USDC_DECIMALS);
  const insufficient = exceedsBalance(amount, balance);
  const needsFunds =
    insufficient ||
    (balance.status === "known" && balance.raw === 0n) ||
    (belowOneUnit(balance) && !amount);
  const request: TradeRequest | null = amount
    ? { bagId, inputMint: USDC_MINT, amount, slippageBps: core.slippageBps }
    : null;

  // One modal at a time: dismiss the buy flow, then present funding once it has animated out.
  const { close } = core;
  const addFunds = useCallback(() => {
    close();
    setTimeout(openFund, 450);
  }, [close, openFund]);

  return {
    ...core,
    balance,
    amountInput,
    amountPending,
    amount,
    insufficient,
    needsFunds,
    setAmount: setEditedAmount,
    request,
    outputMints: core.assetMints,
    addFunds,
  };
}

export type BuyFlow = ReturnType<typeof useBuyFlowState>;

const BuyFlowContext = createContext<BuyFlow | null>(null);

export function BuyFlowProvider({ bagId, children }: { bagId: string; children: React.ReactNode }) {
  const value = useBuyFlowState(bagId);
  return <BuyFlowContext.Provider value={value}>{children}</BuyFlowContext.Provider>;
}

export function useBuyFlow(): BuyFlow {
  const value = useContext(BuyFlowContext);
  if (!value) throw new Error("useBuyFlow must be used inside BuyFlowProvider");
  return value;
}
