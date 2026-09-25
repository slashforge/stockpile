import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBag, fetchBags } from "@/services/api/stockpile";
import type { Bag } from "@/services/api/types";
import { queryKeys } from "./query-keys";

export function useBags() {
  return useQuery({
    queryKey: queryKeys.bags,
    queryFn: fetchBags,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBag(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.bag(id ?? ""),
    queryFn: () => fetchBag(id as string),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    placeholderData: () =>
      queryClient.getQueryData<Bag[]>(queryKeys.bags)?.find((bag) => bag.id === id),
  });
}

/** Map of mint -> asset (symbol/name) across all bags, for labelling holdings and quote legs. */
export function indexAssetsByMint(bags: Bag[] | undefined) {
  const map = new Map<string, { symbol: string; name: string; iconUrl: string | null; uiAmountMultiplier: number }>();
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
