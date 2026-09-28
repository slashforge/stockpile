import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type ChartRange,
  fetchAssetChart,
  fetchBagChart,
} from "@/services/api/charts";
import { ApiError } from "@/services/api/stockpile";
import { queryKeys } from "./query-keys";

// 4xx (e.g. endpoint not deployed yet, unknown mint) won't change on retry: fail soft immediately.
function retryTransient(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500)
    return false;
  return failureCount < 1;
}

/** Bag index series for the detail chart. Failures just hide the chart. */
export function useBagChart(id: string | undefined, range: ChartRange) {
  return useQuery({
    queryKey: queryKeys.bagChart(id ?? "", range),
    queryFn: () => fetchBagChart(id as string, range),
    enabled: !!id,
    staleTime: 60 * 1000,
    retry: retryTransient,
    placeholderData: keepPreviousData,
  });
}

export function useAssetChart(mint: string | null | undefined, range: ChartRange) {
  return useQuery({
    queryKey: queryKeys.assetChart(mint ?? "", range),
    queryFn: () => fetchAssetChart(mint as string, range),
    enabled: !!mint,
    staleTime: 60 * 1000,
    retry: retryTransient,
    placeholderData: keepPreviousData,
  });
}
