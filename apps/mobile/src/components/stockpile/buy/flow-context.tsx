import { router, useNavigation } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFundSheet } from "@/components/stockpile/fund-sheet";
import { usePortfolio } from "@/hooks/use-account";
import { useBag } from "@/hooks/use-bags";
import { useLotRecorder } from "@/hooks/use-positions";
import { useLegSigning, usePrepareTrade } from "@/hooks/use-trade";
import { waitForConfirmation } from "@/lib/solana/rpc";
import { USDC_DECIMALS, USDC_MINT } from "@/lib/solana/transaction";
import { belowOneUnit, defaultBuyAmount, exceedsBalance, spendableUsdc } from "@/lib/trade/balance";
import { legAssetMint, type TradeSide } from "@/lib/trade/legs";
import { purchaseStatus } from "@/lib/trade/purchase";
import {
  applyCarriedConfirmation,
  type CarriedLegs,
  carryLegs,
  isPreparedExpired,
  legHeights,
  NO_CARRIED,
  pollUntilSettled,
  secondsUntilExpiry,
} from "@/lib/trade/signing";
import type { PreparedTrade, TradeRequest } from "@/services/api/types";
import { toBaseUnits } from "@/utils/amounts";

/**
 * Legs broadcast in earlier prepared sets, keyed by mint. Pending ones keep being polled by
 * signature so they only count as done once confirmed (and become retryable if they fail).
 */
export function useCarriedLegs() {
  const [carried, setCarried] = useState<CarriedLegs>(NO_CARRIED);
  const polling = useRef(new Set<string>());
  useEffect(() => {
    for (const [mint, state] of Object.entries(carried)) {
      if (state.status !== "submitted" || polling.current.has(state.signature)) continue;
      const { signature } = state;
      polling.current.add(signature);
      const lastValidBlockHeight = state.lastValidBlockHeight;
      void pollUntilSettled(signature, (sig) => waitForConfirmation(sig, { lastValidBlockHeight })).then((result) =>
        setCarried((current) => applyCarriedConfirmation(current, mint, signature, result)),
      );
    }
  }, [carried]);
  return [carried, setCarried] as const;
}

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
  // Legs broadcast in earlier prepared sets of this run, by bag token mint (survives every rebuild).
  const [alreadyBought, setAlreadyBought] = useCarriedLegs();

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
    for (const state of Object.values(alreadyBought)) {
      if (state.status === "confirmed") record(state.signature);
    }
  }, [signing.states, alreadyBought, record]);

  /**
   * Builds a fresh signable set. `carry` keeps legs sent so far so a retry never repeats them; a
   * rebuild that comes back unavailable leaves the current set and progress untouched.
   */
  const runPrepare = useCallback(
    (
      next: TradeRequest,
      options: {
        carry?: boolean;
        onDone?: (data: PreparedTrade, alreadyBought: CarriedLegs) => void;
      } = {},
    ) => {
      const carried = options.carry ? carryLegs(alreadyBought, assetMints, signing.states, legHeights(prepared)) : NO_CARRIED;
      prepare.mutate(next, {
        onSuccess: (data) => {
          if (options.carry && data.status !== "ready") {
            options.onDone?.(data, carried);
            return;
          }
          signing.reset();
          setAlreadyBought(carried);
          setPrepared(data);
          setPreparedAt(Date.now());
          setNow(Date.now());
          options.onDone?.(data, carried);
        },
      });
    },
    [alreadyBought, setAlreadyBought, assetMints, prepared, signing, prepare],
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
