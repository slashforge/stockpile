import { useQuery } from "@tanstack/react-query";
import { fetchBagReturns } from "@/services/api/returns";
import { queryKeys } from "./query-keys";

/** 1M / 1Y / all-time index returns for every bag, fetched once per list. */
export function useBagReturns() {
  return useQuery({
    queryKey: queryKeys.bagReturns,
    queryFn: fetchBagReturns,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
