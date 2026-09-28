import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useBlocker, useRouter, useRouterState } from "@tanstack/react-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IoChevronBack, IoClose } from "react-icons/io5";
import { useFundSheet } from "@/components/sheets/fund-sheet";
import { LogoCluster } from "@/components/stockpile/bag-art";
import { T } from "@/components/ui/type";
import { queryKeys } from "@/hooks/query-keys";
import { usePortfolio } from "@/hooks/use-account";
import { useBag } from "@/hooks/use-bags";
import { useLooseHoldings } from "@/hooks/use-loose-holdings";
import { useBagPosition, useLotRecorder } from "@/hooks/use-positions";
import { useLegSigning, usePrepareTrade } from "@/hooks/use-trade";
import { inspectTransaction, USDC_DECIMALS, USDC_MINT } from "@/lib/solana/transaction";
import { belowOneUnit, defaultBuyAmount, exceedsBalance, spendableUsdc } from "@/lib/trade/balance";
import { legAssetMint, tokenSellLabelProblems, totalOutput, type TradeSide } from "@/lib/trade/legs";
import { type PurchaseStatus, purchaseStatus } from "@/lib/trade/purchase";
import { boughtMints, isPreparedExpired, secondsUntilExpiry } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { prepareTokenSell, quoteTokenSell, quoteTrade } from "@/services/api/stockpile";
import type {
  BagAsset,
  PreparedTrade,
  PreparedTransaction,
  QuoteLeg,
  TokenSellPrepared,
  TokenSellRequest,
  TradeRequest,
} from "@/services/api/types";
import { toBaseUnits } from "@/utils/amounts";
import { TradeSettings } from "./controls";

/**
 * Leaves the whole flow (amount → review → progress), back to wherever it was opened from, the way
 * dismissing the modal does on mobile. Opened directly (no history before it): go to `fallback`.
 */
function useFlowExit(fallback: string) {
  const router = useRouter();
  const entry = useRef<number | undefined>(router.history.location.state.__TSR_index);
  return useCallback(() => {
    const start = entry.current;
    const current = router.history.location.state.__TSR_index;
    if (typeof start === "number" && start > 0 && typeof current === "number" && current >= start) {
      router.history.go(-(current - start + 1));
    } else {
      router.history.replace(fallback);
    }
  }, [router, fallback]);
}

/** Leaving mid-signing would orphan swaps being sent: confirm first, and warn on tab close. */
function useGuardRunning(running: boolean) {
  useBlocker({
    shouldBlockFn: () => running && !window.confirm("Swaps are still being sent. Leave anyway?"),
    enableBeforeUnload: () => running,
  });
}

/** Clock for the prepared-set expiry countdown. */
function useExpiryClock(preparedAt: number | null) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (preparedAt == null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [preparedAt]);
  return { now, refresh: () => setNow(Date.now()) };
}

/**
 * Everything a buy or sell of a whole bag shares: one prepared set of per-leg transactions, their
 * signing, retries that skip legs already done, expiry, and linking confirmed swaps to the bag.
 */
function useTradeFlowCore(bagId: string, side: TradeSide) {
  const bag = useBag(bagId);
  const prepare = usePrepareTrade();
  const signing = useLegSigning(bagId);
  const lots = useLotRecorder(bagId);
  // null = automatic price protection (Jupiter's estimator); a number is the advanced override.
  const [slippageBps, setSlippageBps] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<PreparedTrade | null>(null);
  const [preparedAt, setPreparedAt] = useState<number | null>(null);
  const clock = useExpiryClock(preparedAt);
  // Bag token mints traded in earlier prepared sets of this run (survives every rebuild).
  const [alreadyBought, setAlreadyBought] = useState<ReadonlySet<string>>(() => new Set());

  const assetMints = useMemo(
    () => (prepared?.status === "ready" ? prepared.transactions.map((tx) => legAssetMint(tx, side)) : []),
    [prepared, side],
  );
  const status = purchaseStatus(assetMints, signing.states, alreadyBought, signing.inFlight);

  // Link every confirmed swap to the bag's position.
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
      options: { carry?: boolean; onDone?: (data: PreparedTrade, alreadyBought: ReadonlySet<string>) => void } = {},
    ) => {
      const carried = options.carry ? new Set([...alreadyBought, ...boughtMints(assetMints, signing.states)]) : new Set<string>();
      prepare.mutate(next, {
        onSuccess: (data) => {
          signing.reset();
          setAlreadyBought(carried);
          setPrepared(data);
          setPreparedAt(Date.now());
          options.onDone?.(data, carried);
        },
      });
    },
    [alreadyBought, assetMints, signing, prepare],
  );

  const close = useFlowExit(`/bag/${bagId}`);
  useGuardRunning(status === "running");

  return {
    side,
    bagId,
    bag,
    slippageBps,
    setSlippageBps,
    prepare,
    prepared,
    preparedAt,
    expired: isPreparedExpired(preparedAt, clock.now),
    secondsLeft: secondsUntilExpiry(preparedAt, clock.now),
    refreshClock: clock.refresh,
    runPrepare,
    signing,
    alreadyBought,
    assetMints,
    status,
    close,
    lots,
  };
}

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
    insufficient || (balance.status === "known" && balance.raw === 0n) || (belowOneUnit(balance) && !amount);
  const request: TradeRequest | null = amount
    ? { bagId, inputMint: USDC_MINT, amount, slippageBps: core.slippageBps }
    : null;
  const { close } = core;
  const addFunds = useCallback(() => {
    close();
    setTimeout(openFund, 150);
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

export function BuyFlowProvider({ bagId, children }: { bagId: string; children: ReactNode }) {
  const value = useBuyFlowState(bagId);
  return <BuyFlowContext.Provider value={value}>{children}</BuyFlowContext.Provider>;
}

export function useBuyFlow(): BuyFlow {
  const value = useContext(BuyFlowContext);
  if (!value) throw new Error("useBuyFlow must be used inside BuyFlowProvider");
  return value;
}

export const SELL_PORTIONS = [2500, 5000, 7500, 10000] as const;

/** USDC (base units) a sell quote or prepared set pays out: the server total, else the leg sum. */
export function sellTotalOut(response: { totalOutAmount?: string | null; legs?: QuoteLeg[]; transactions?: QuoteLeg[] }) {
  if (response.totalOutAmount && /^\d+$/.test(response.totalOutAmount)) return BigInt(response.totalOutAmount);
  return totalOutput(response.legs ?? response.transactions ?? []);
}

/** Sum of every leg's minimum USDC out, or null when any leg doesn't report one. */
export function minTotalOut(legs: QuoteLeg[]) {
  let total = 0n;
  for (const leg of legs) {
    if (!leg.minOutAmount || !/^\d+$/.test(leg.minOutAmount)) return null;
    total += BigInt(leg.minOutAmount);
  }
  return total;
}

function useSellFlowState(bagId: string) {
  const core = useTradeFlowCore(bagId, "sell");
  const { authenticated, walletAddress } = useStockpileAuth();
  const { position, query: positions } = useBagPosition(bagId);
  const [portionBps, setPortionBps] = useState<number>(10000);
  // Sell: the server sizes each leg from what the wallet holds times `portionBps`.
  const request: TradeRequest = { bagId, side: "sell", portionBps, slippageBps: core.slippageBps };
  const quote = useQuery({
    queryKey: queryKeys.sellQuote(bagId, portionBps, core.slippageBps),
    queryFn: () => quoteTrade(request),
    enabled: authenticated && !!walletAddress,
    staleTime: 20 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });
  return { ...core, portionBps, setPortionBps, request, quote, position, positions };
}

export type SellFlow = ReturnType<typeof useSellFlowState>;
const SellFlowContext = createContext<SellFlow | null>(null);

export function SellFlowProvider({ bagId, children }: { bagId: string; children: ReactNode }) {
  const value = useSellFlowState(bagId);
  return <SellFlowContext.Provider value={value}>{children}</SellFlowContext.Provider>;
}

export function useSellFlow(): SellFlow {
  const value = useContext(SellFlowContext);
  if (!value) throw new Error("useSellFlow must be used inside SellFlowProvider");
  return value;
}

/** Everything that blocks signing a token-sell leg: decode errors, unsafe instructions, label mismatches. */
export function tokenLegBlocking(
  tx: PreparedTransaction,
  mints: readonly string[],
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
  return [...errors, ...tokenSellLabelProblems(tx, mints, index, total)];
}

/**
 * Direct sell of picked tokens held outside every bag. Same shape as the bag sell flow but never
 * links swaps to a bag: the server only sells loose balances, so bag positions are untouched.
 */
function useTokenSellFlowState(mints: string[]) {
  const { authenticated, walletAddress } = useStockpileAuth();
  const loose = useLooseHoldings();
  const signing = useLegSigning();
  const prepare = useMutation({ mutationFn: (request: TokenSellRequest) => prepareTokenSell(request) });
  const [slippageBps, setSlippageBps] = useState<number | null>(null);
  const [portionBps, setPortionBps] = useState<number>(10000);
  const [prepared, setPrepared] = useState<TokenSellPrepared | null>(null);
  const [preparedAt, setPreparedAt] = useState<number | null>(null);
  const clock = useExpiryClock(preparedAt);
  const [alreadySold, setAlreadySold] = useState<ReadonlySet<string>>(() => new Set());

  const live = useMemo(
    () => mints.map((mint) => loose.holdings.find((holding) => holding.mint === mint)).filter((h) => !!h),
    [mints, loose.holdings],
  );
  // Freeze what was picked once balances settle: sold tokens drop out of the loose list after the
  // post-sale refetch, but the progress screen still needs their names and icons.
  const [snapshot, setSnapshot] = useState<typeof live | null>(null);
  if (!snapshot && loose.settled && loose.portfolio.data) setSnapshot(live);
  const picked = snapshot ?? live;
  const subject = useMemo(
    () => ({
      title: picked.length === 1 ? (picked[0]!.symbol ?? "1 token") : `${mints.length} tokens`,
      assets: picked.map((holding) => ({ symbol: holding.symbol ?? "?", iconUrl: holding.iconUrl, mint: holding.mint })),
    }),
    [picked, mints.length],
  );

  const request: TokenSellRequest = { mints, portionBps, slippageBps };
  const quote = useQuery({
    queryKey: queryKeys.tokenSellQuote(mints, portionBps, slippageBps),
    queryFn: () => quoteTokenSell(request),
    enabled: authenticated && !!walletAddress && mints.length > 0,
    staleTime: 20 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const assetMints = useMemo(
    () => (prepared?.status === "ready" ? prepared.transactions.map((tx) => tx.inputMint) : []),
    [prepared],
  );
  const status = purchaseStatus(assetMints, signing.states, alreadySold, signing.inFlight);

  const runPrepare = useCallback(
    (
      next: TokenSellRequest,
      options: { carry?: boolean; onDone?: (data: TokenSellPrepared, sold: ReadonlySet<string>) => void } = {},
    ) => {
      const carried = options.carry ? new Set([...alreadySold, ...boughtMints(assetMints, signing.states)]) : new Set<string>();
      // A retry only asks for what's still unsold; sold mints have no loose balance left to size from.
      const body = options.carry ? { ...next, mints: next.mints.filter((mint) => !carried.has(mint)) } : next;
      prepare.mutate(body, {
        onSuccess: (data) => {
          signing.reset();
          setAlreadySold(carried);
          setPrepared(data);
          setPreparedAt(Date.now());
          options.onDone?.(data, carried);
        },
      });
    },
    [alreadySold, assetMints, signing, prepare],
  );

  const close = useFlowExit("/portfolio");
  useGuardRunning(status === "running");

  return {
    mints,
    subject,
    picked,
    loose,
    request,
    quote,
    portionBps,
    setPortionBps,
    slippageBps,
    setSlippageBps,
    prepare,
    prepared,
    preparedAt,
    expired: isPreparedExpired(preparedAt, clock.now),
    secondsLeft: secondsUntilExpiry(preparedAt, clock.now),
    refreshClock: clock.refresh,
    runPrepare,
    signing,
    alreadySold,
    assetMints,
    status,
    close,
  };
}

export type TokenSellFlow = ReturnType<typeof useTokenSellFlowState>;
const TokenSellFlowContext = createContext<TokenSellFlow | null>(null);

export function TokenSellFlowProvider({ mints, children }: { mints: string[]; children: ReactNode }) {
  const value = useTokenSellFlowState(mints);
  return <TokenSellFlowContext.Provider value={value}>{children}</TokenSellFlowContext.Provider>;
}

export function useTokenSellFlow(): TokenSellFlow {
  const value = useContext(TokenSellFlowContext);
  if (!value) throw new Error("useTokenSellFlow must be used inside TokenSellFlowProvider");
  return value;
}

type FlowSubject = { title: string; assets: Pick<BagAsset, "symbol" | "iconUrl">[] };

/**
 * Buy/sell frame: a focused sheet-like card (full screen on phones) with the flow header —
 * back on review, close otherwise (hidden while swaps run), trade settings on the amount step.
 */
export function FlowShell({
  subject,
  status,
  close,
  titles,
  slippageBps,
  onSlippageChange,
  children,
}: {
  subject: FlowSubject | undefined;
  status: PurchaseStatus;
  close: () => void;
  titles: { amount: string; review: string; progress: string };
  slippageBps: number | null;
  onSlippageChange: (bps: number | null) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const onProgress = pathname.endsWith("/progress");
  const onReview = pathname.endsWith("/review");
  const onAmount = !onProgress && !onReview;
  const title = onProgress ? titles.progress : onReview ? titles.review : titles.amount;

  return (
    <div className="flex min-h-dvh justify-center bg-canvas md:items-center md:bg-[radial-gradient(ellipse_at_top,var(--ds-accent-soft),var(--ds-canvas)_60%)] md:p-6">
      <div className="flex min-h-dvh w-full max-w-[480px] flex-col bg-canvas md:h-[min(860px,calc(100dvh-48px))] md:min-h-0 md:overflow-hidden md:rounded-[28px] md:border md:border-line md:shadow-float">
        <header className="flex items-center gap-2 px-4 pb-1.5 pt-3.5">
          <div className="w-9">
            {onReview ? (
              <button
                type="button"
                aria-label="Back"
                onClick={() => router.history.back()}
                className="flex size-9 items-center justify-center rounded-full bg-sunken text-ink-2 hover:opacity-80"
              >
                <IoChevronBack size={20} />
              </button>
            ) : status === "running" ? null : (
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="flex size-9 items-center justify-center rounded-full bg-sunken text-ink-2 hover:opacity-80"
              >
                <IoClose size={20} />
              </button>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
            <T as="h1" variant="headline" lines={1}>
              {title}
            </T>
            <div className="flex max-w-full items-center gap-1.5">
              {subject ? <LogoCluster assets={subject.assets} size={18} limit={4} flat /> : null}
              <T variant="caption" tone="secondary" lines={1}>
                {subject?.title ?? " "}
              </T>
            </div>
          </div>
          <div className="flex w-9 justify-end">
            {onAmount ? (
              <TradeSettings
                value={slippageBps}
                open={settingsOpen}
                onToggle={() => setSettingsOpen((open) => !open)}
                onChange={onSlippageChange}
                onClose={() => setSettingsOpen(false)}
              />
            ) : null}
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
