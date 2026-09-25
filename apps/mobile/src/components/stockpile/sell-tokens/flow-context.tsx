import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { router, useNavigation } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { queryKeys } from "@/hooks/query-keys";
import { useLooseHoldings } from "@/hooks/use-loose-holdings";
import { useLegSigning } from "@/hooks/use-trade";
import { inspectTransaction } from "@/lib/solana/transaction";
import { tokenSellLabelProblems } from "@/lib/trade/legs";
import { purchaseStatus } from "@/lib/trade/purchase";
import { boughtMints, isPreparedExpired, secondsUntilExpiry } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { prepareTokenSell, quoteTokenSell } from "@/services/api/stockpile";
import type { PreparedTransaction, TokenSellPrepared, TokenSellRequest } from "@/services/api/types";

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
 * Direct sell of picked tokens held outside every bag. Same shape as the bag sell flow (quote ->
 * prepare -> sign all -> retry what's missing) but never links swaps to a bag: the server only
 * sells loose balances, so bag positions are untouched.
 */
function useTokenSellFlowState(mints: string[]) {
  const navigation = useNavigation();
  const { authenticated, walletAddress } = useStockpileAuth();
  const loose = useLooseHoldings();
  const signing = useLegSigning();
  const prepare = useMutation({ mutationFn: (request: TokenSellRequest) => prepareTokenSell(request) });
  const [slippageBps, setSlippageBps] = useState<number | null>(null);
  const [portionBps, setPortionBps] = useState<number>(10000);
  const [prepared, setPrepared] = useState<TokenSellPrepared | null>(null);
  const [preparedAt, setPreparedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // Mints sold in earlier prepared sets of this run; retries skip them.
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
      title: picked.length === 1 ? (picked[0].symbol ?? "1 token") : `${mints.length} tokens`,
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

  useEffect(() => {
    if (preparedAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [preparedAt]);

  const runPrepare = useCallback(
    (
      next: TokenSellRequest,
      options: { carry?: boolean; onDone?: (data: TokenSellPrepared, sold: ReadonlySet<string>) => void } = {},
    ) => {
      const carried = options.carry
        ? new Set([...alreadySold, ...boughtMints(assetMints, signing.states)])
        : new Set<string>();
      // A retry only asks for what's still unsold; sold mints have no loose balance left to size from.
      const body = options.carry ? { ...next, mints: next.mints.filter((mint) => !carried.has(mint)) } : next;
      prepare.mutate(body, {
        onSuccess: (data) => {
          signing.reset();
          setAlreadySold(carried);
          setPrepared(data);
          setPreparedAt(Date.now());
          setNow(Date.now());
          options.onDone?.(data, carried);
        },
      });
    },
    [alreadySold, assetMints, signing, prepare],
  );

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/portfolio");
  }, [navigation]);

  const running = status === "running";
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !running });
  }, [navigation, running]);

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
    expired: isPreparedExpired(preparedAt, now),
    secondsLeft: secondsUntilExpiry(preparedAt, now),
    refreshClock: () => setNow(Date.now()),
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

export function TokenSellFlowProvider({ mints, children }: { mints: string[]; children: React.ReactNode }) {
  const value = useTokenSellFlowState(mints);
  return <TokenSellFlowContext.Provider value={value}>{children}</TokenSellFlowContext.Provider>;
}

export function useTokenSellFlow(): TokenSellFlow {
  const value = useContext(TokenSellFlowContext);
  if (!value) throw new Error("useTokenSellFlow must be used inside TokenSellFlowProvider");
  return value;
}
