import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { waitForConfirmation } from "@/lib/solana/rpc";
import { serialize } from "@/lib/trade/purchase";
import { canSignLeg, type LegSigningState, signLeg as runSignLeg } from "@/lib/trade/signing";
import { useNewsbidAuth } from "@/providers/auth-context";
import { prepareTrade, quoteTrade } from "@/services/api/newsbid";
import type { TradeRequest } from "@/services/api/types";
import { queryKeys } from "./query-keys";

export type { LegSigningState };

/** What signing needs from a prepared leg: its transaction and the Jupiter order to execute it with. */
export type PreparedLeg = { transaction: string; requestId: string; lastValidBlockHeight?: number | null };

/**
 * Mirrors mobile: Privy's embedded wallet doesn't document concurrent signing requests, so wallet
 * calls are handed over one at a time (no user prompt either way) while confirmations run concurrently.
 * Flip to true to also send the wallet requests in parallel.
 */
const CONCURRENT_WALLET_REQUESTS = false;

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
export function useLegSigning(bagId?: string) {
  const { signAndSendTransaction, walletAddress } = useNewsbidAuth();
  // Tags every submit with the bag so the server links confirmed legs itself, and with the leg's
  // Jupiter order id so it is executed through Jupiter.
  const send = useMemo(
    () =>
      signAndSendTransaction
        ? (base64: string, requestId: string) => signAndSendTransaction(base64, { bagId, requestId })
        : null,
    [signAndSendTransaction, bagId],
  );
  const queryClient = useQueryClient();
  const [states, setStates] = useState<Record<number, LegSigningState>>({});
  const statesRef = useRef(states);
  const [inFlight, setInFlight] = useState(false);
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
    setInFlight(false);
  }, []);

  const signLeg = useCallback(
    async (index: number, leg: PreparedLeg, onSubmitted?: () => void) => {
      // Guards double-taps and re-sending anything that was already broadcast.
      if (!canSignLeg(statesRef.current[index])) return;
      const gen = generation.current;
      update(gen, index, { status: "signing" });
      await runSignLeg(leg.transaction, walletAddress, {
        signAndSend: send ? (base64) => send(base64, leg.requestId) : null,
        waitForConfirmation: (signature) => waitForConfirmation(signature, { lastValidBlockHeight: leg.lastValidBlockHeight }),
        onState: (state) => {
          update(gen, index, state);
          // Fires once the wallet has broadcast, so the caller can move on to the next leg.
          if (state.status === "submitted" && gen === generation.current) onSubmitted?.();
        },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      queryClient.invalidateQueries({ queryKey: queryKeys.sellQuotes });
      queryClient.invalidateQueries({ queryKey: queryKeys.tokenSellQuotes });
    },
    [send, walletAddress, queryClient],
  );

  /**
   * Signs and submits every given leg after a single user confirmation. Legs already broadcast are
   * skipped. Resolves once every leg is confirmed, failed or left unknown.
   */
  const signAll = useCallback(
    async (legs: ({ index: number } & PreparedLeg)[]) => {
      const gen = generation.current;
      const pending = legs.filter((leg) => canSignLeg(statesRef.current[leg.index]));
      if (pending.length === 0) return;
      for (const leg of pending) update(gen, leg.index, { status: "signing" });
      setInFlight(true);
      const signAndSend = send && !CONCURRENT_WALLET_REQUESTS ? serialize(send) : send;
      await Promise.allSettled(
        pending.map((leg) =>
          runSignLeg(leg.transaction, walletAddress, {
            signAndSend: signAndSend ? (base64) => signAndSend(base64, leg.requestId) : null,
            waitForConfirmation: (signature) =>
              waitForConfirmation(signature, { lastValidBlockHeight: leg.lastValidBlockHeight }),
            onState: (state) => update(gen, leg.index, state),
          }).catch((error: unknown) => {
            const current = statesRef.current[leg.index];
            // Once broadcast, keep the signature so the leg is never offered for re-sending.
            const signature = current && "signature" in current ? current.signature : undefined;
            update(gen, leg.index, {
              status: "failed",
              signature,
              error: error instanceof Error ? error.message : "Signing failed.",
            });
          }),
        ),
      );
      if (gen === generation.current) setInFlight(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      queryClient.invalidateQueries({ queryKey: queryKeys.sellQuotes });
      queryClient.invalidateQueries({ queryKey: queryKeys.tokenSellQuotes });
    },
    [send, walletAddress, queryClient],
  );

  return { states, inFlight, signLeg, signAll, reset };
}
