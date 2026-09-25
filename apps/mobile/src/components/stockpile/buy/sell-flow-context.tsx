import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { queryKeys } from "@/hooks/query-keys";
import { useBagPosition } from "@/hooks/use-positions";
import { totalOutput } from "@/lib/trade/legs";
import { useStockpileAuth } from "@/providers/auth-context";
import { quoteTrade } from "@/services/api/stockpile";
import type { QuoteLeg, TradeRequest } from "@/services/api/types";
import { useTradeFlowCore } from "./flow-context";

export const SELL_PORTIONS = [2500, 5000, 7500, 10000] as const;

/**
 * Sell request: the server sizes each leg from what the wallet holds of the bag's tokens times
 * `portionBps`; `amount` / `inputMint` are ignored on a sell.
 */
export function sellRequest(bagId: string, portionBps: number, slippageBps: number | null): TradeRequest {
  return { bagId, side: "sell", portionBps, slippageBps };
}

/** USDC (base units) a sell quote or prepared set pays out: the server total, else the leg sum. */
export function sellTotalOut(response: {
  totalOutAmount?: string | null;
  legs?: QuoteLeg[];
  transactions?: QuoteLeg[];
}) {
  if (response.totalOutAmount && /^\d+$/.test(response.totalOutAmount)) {
    return BigInt(response.totalOutAmount);
  }
  return totalOutput(response.legs ?? response.transactions ?? []);
}

function useSellFlowState(bagId: string) {
  const core = useTradeFlowCore(bagId, "sell");
  const { authenticated, walletAddress } = useStockpileAuth();
  const { position, query: positions } = useBagPosition(bagId);
  const [portionBps, setPortionBps] = useState<number>(10000);
  const request = sellRequest(bagId, portionBps, core.slippageBps);

  const quote = useQuery({
    queryKey: queryKeys.sellQuote(bagId, portionBps, core.slippageBps),
    queryFn: () => quoteTrade(request),
    enabled: authenticated && !!walletAddress,
    staleTime: 20 * 1000,
    // Switching portion or protection keeps the last estimate on screen (dimmed) instead of blanking it.
    placeholderData: keepPreviousData,
    retry: 1,
  });

  return {
    ...core,
    portionBps,
    setPortionBps,
    request,
    quote,
    position,
    positions,
  };
}

export type SellFlow = ReturnType<typeof useSellFlowState>;

const SellFlowContext = createContext<SellFlow | null>(null);

export function SellFlowProvider({ bagId, children }: { bagId: string; children: React.ReactNode }) {
  const value = useSellFlowState(bagId);
  return <SellFlowContext.Provider value={value}>{children}</SellFlowContext.Provider>;
}

export function useSellFlow(): SellFlow {
  const value = useContext(SellFlowContext);
  if (!value) throw new Error("useSellFlow must be used inside SellFlowProvider");
  return value;
}
