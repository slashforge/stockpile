import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { recordLotWithRetry } from "@/lib/trade/record-lot";
import { useStockpileAuth } from "@/providers/auth-context";
import { fetchPositions, heldPositions, recordBagLeg } from "@/services/api/positions";
import { queryKeys } from "./query-keys";

/** Per-bag positions derived by the server from linked swaps and the wallet's balances. */
export function usePositions() {
  const { authenticated } = useStockpileAuth();
  return useQuery({
    queryKey: queryKeys.positions,
    queryFn: fetchPositions,
    enabled: authenticated,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

/** The signed-in user's open position in one bag, if any. */
export function useBagPosition(bagId: string | undefined) {
  const positions = usePositions();
  const position = heldPositions(positions.data).find((bag) => bag.bagId === bagId) ?? null;
  return { position, query: positions };
}

export type LotLinkState = "linking" | "linked" | "failed";

/**
 * Links confirmed swap signatures to their bag in the background. Each signature is sent once
 * (retried with backoff); a hard failure can be retried from the UI.
 */
export function useLotRecorder(bagId: string) {
  const queryClient = useQueryClient();
  const [states, setStates] = useState<Record<string, LotLinkState>>({});
  const started = useRef(new Set<string>());

  const run = useCallback(
    (signature: string) => {
      started.current.add(signature);
      setStates((current) => ({ ...current, [signature]: "linking" }));
      recordLotWithRetry(() => recordBagLeg(bagId, signature)).then((outcome) => {
        setStates((current) => ({ ...current, [signature]: outcome.status === "linked" ? "linked" : "failed" }));
        if (outcome.status === "linked") {
          queryClient.invalidateQueries({ queryKey: queryKeys.positions });
        }
      });
    },
    [bagId, queryClient],
  );

  const record = useCallback(
    (signature: string) => {
      if (started.current.has(signature)) return;
      run(signature);
    },
    [run],
  );

  return { states, record, retry: run };
}
