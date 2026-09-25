import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBag, fetchBagHistory, fetchBags } from "@/services/api/stockpile";
import type { Bag, HistoryRange } from "@/services/api/types";
import { queryKeys } from "./query-keys";

export function useBags() {
  return useQuery({
    queryKey: queryKeys.bags,
    queryFn: fetchBags,
    staleTime: 5 * 60 * 1000,
  });
}

/** Price history for the detail sparkline. Failures just hide the chart. */
export function useBagHistory(
  id: string | undefined,
  range: HistoryRange = "7d",
) {
  return useQuery({
    queryKey: queryKeys.bagHistory(id ?? "", range),
    queryFn: () => fetchBagHistory(id as string, range),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useBag(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.bag(id ?? ""),
    queryFn: async () => {
      const fresh = await fetchBag(id as string);
      // Keep the list in step with the detail so both screens show the same bag.
      queryClient.setQueryData<Bag[]>(queryKeys.bags, (list) =>
        list?.map((bag) => (bag.id === fresh.id ? fresh : bag)),
      );
      return fresh;
    },
    enabled: !!id,
    // Detail always refetches on mount/focus; the list cache is only a placeholder.
    staleTime: 0,
    placeholderData: () =>
      queryClient
        .getQueryData<Bag[]>(queryKeys.bags)
        ?.find((bag) => bag.id === id),
  });
}

/** Map of mint -> asset (symbol/name) across all bags, for labelling holdings and quote legs. */
export function indexAssetsByMint(bags: Bag[] | undefined) {
  const map = new Map<
    string,
    {
      symbol: string;
      name: string;
      iconUrl: string | null;
      uiAmountMultiplier: number;
    }
  >();
  for (const bag of bags ?? []) {
    for (const asset of bag.assets) {
      if (asset.mint && !map.has(asset.mint)) {
        map.set(asset.mint, {
          symbol: asset.symbol,
          name: asset.name,
          iconUrl: asset.iconUrl,
          uiAmountMultiplier: asset.uiAmountMultiplier,
        });
      }
    }
  }
  return map;
}
