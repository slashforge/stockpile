import { router, useNavigation } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useFundSheet } from "@/components/stockpile/fund-sheet";
import { usePortfolio } from "@/hooks/use-account";
import { useBag } from "@/hooks/use-bags";
import { useLegSigning, usePrepareTrade } from "@/hooks/use-trade";
import { USDC_DECIMALS, USDC_MINT } from "@/lib/solana/transaction";
import { belowOneUnit, defaultBuyAmount, exceedsBalance, spendableUsdc } from "@/lib/trade/balance";
import { purchaseStatus } from "@/lib/trade/purchase";
import { boughtMints, isPreparedExpired, secondsUntilExpiry } from "@/lib/trade/signing";
import type { PreparedTrade, TradeRequest } from "@/services/api/types";
import { toBaseUnits } from "@/utils/amounts";

function useBuyFlowState(bagId: string) {
  const navigation = useNavigation();
  const bag = useBag(bagId);
  const portfolio = usePortfolio();
  const { openFund } = useFundSheet();

  // null until the user edits: until then the amount follows the balance-based default.
  const [editedAmount, setEditedAmount] = useState<string | null>(null);
  const [slippageBps, setSlippageBps] = useState(100);
  const prepare = usePrepareTrade();
  const signing = useLegSigning();
  const [prepared, setPrepared] = useState<PreparedTrade | null>(null);
  const [preparedAt, setPreparedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // Output mints bought in earlier prepared sets of this purchase (survives every rebuild).
  const [alreadyBought, setAlreadyBought] = useState<ReadonlySet<string>>(() => new Set());

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
    ? { bagId, inputMint: USDC_MINT, amount, slippageBps }
    : null;

  const outputMints = useMemo(
    () => (prepared?.status === "ready" ? prepared.transactions.map((tx) => tx.outputMint) : []),
    [prepared],
  );
  const status = purchaseStatus(outputMints, signing.states, alreadyBought, signing.inFlight);

  useEffect(() => {
    if (preparedAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [preparedAt]);

  /** Builds a fresh signable set. `carry` keeps assets bought so far so a retry never re-buys them. */
  const runPrepare = useCallback(
    (
      next: TradeRequest,
      options: {
        carry?: boolean;
        onDone?: (data: PreparedTrade, alreadyBought: ReadonlySet<string>) => void;
      } = {},
    ) => {
      const carried = options.carry
        ? new Set([...alreadyBought, ...boughtMints(outputMints, signing.states)])
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
    [alreadyBought, outputMints, signing, prepare],
  );

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/");
  }, [navigation]);

  // One modal at a time: dismiss the buy flow, then present funding once it has animated out.
  const addFunds = useCallback(() => {
    close();
    setTimeout(openFund, 450);
  }, [close, openFund]);

  // No swipe-to-dismiss while swaps are being signed and sent.
  const running = status === "running";
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !running });
  }, [navigation, running]);

  return {
    bagId,
    bag,
    balance,
    amountInput,
    amountPending,
    amount,
    insufficient,
    needsFunds,
    setAmount: setEditedAmount,
    slippageBps,
    setSlippageBps,
    request,
    prepare,
    prepared,
    preparedAt,
    expired: isPreparedExpired(preparedAt, now),
    secondsLeft: secondsUntilExpiry(preparedAt, now),
    refreshClock: () => setNow(Date.now()),
    runPrepare,
    signing,
    alreadyBought,
    outputMints,
    status,
    close,
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
