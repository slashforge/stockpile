import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { waitForConfirmation } from "@/lib/solana/rpc";
import { canSignLeg, type LegSigningState, signLeg as runSignLeg } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { prepareTrade, quoteTrade } from "@/services/api/stockpile";
import type { TradeRequest } from "@/services/api/types";
import { queryKeys } from "./query-keys";

export type { LegSigningState };

export function useTradeQuote() {
  return useMutation({ mutationFn: (request: TradeRequest) => quoteTrade(request) });
}

export function usePrepareTrade() {
  return useMutation({ mutationFn: (request: TradeRequest) => prepareTrade(request) });
}

/**
 * Tracks the user-approved signing of each prepared transaction independently.
 * Nothing is signed unless `signLeg` is called for that index.
 */
export function useLegSigning() {
  const { signAndSendTransaction, walletAddress } = useStockpileAuth();
  const queryClient = useQueryClient();
  const [states, setStates] = useState<Record<number, LegSigningState>>({});
  const statesRef = useRef(states);
  // Bumped on reset so late results from a discarded prepared set are ignored.
  const generation = useRef(0);

  const update = (gen: number, index: number, state: LegSigningState) => {
    if (gen !== generation.current) return;
    statesRef.current = { ...statesRef.current, [index]: state };
    setStates(statesRef.current);
  };

  const reset = useCallback(() => {
    generation.current += 1;
    statesRef.current = {};
    setStates({});
  }, []);

  const signLeg = useCallback(
    async (index: number, base64Transaction: string) => {
      // Guards double-taps and re-sending anything that was already broadcast.
      if (!canSignLeg(statesRef.current[index])) return;
      const gen = generation.current;
      update(gen, index, { status: "signing" });
      await runSignLeg(base64Transaction, walletAddress, {
        signAndSend: signAndSendTransaction,
        waitForConfirmation,
        onState: (state) => update(gen, index, state),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio });
    },
    [signAndSendTransaction, walletAddress, queryClient],
  );

  return { states, signLeg, reset };
}
