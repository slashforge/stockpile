import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStockpileAuth } from "@/providers/auth-context";
import {
  fetchActivity,
  fetchMe,
  fetchPortfolio,
  fetchSavedBagIds,
  saveBag,
  unsaveBag,
} from "@/services/api/stockpile";
import { queryKeys } from "./query-keys";

export function useMe() {
  const { authenticated } = useStockpileAuth();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchMe,
    enabled: authenticated,
  });
}

/**
 * Live wallet balances. Polls so deposits and fills show up without a reload: every minute normally, every
 * 10s while the server reports balances unavailable (e.g. wallet just created), and at `pollMs` when a
 * caller is waiting on a change (the fund sheet). React Query runs the fastest interval among observers.
 */
export function usePortfolio({ pollMs }: { pollMs?: number } = {}) {
  const { authenticated } = useStockpileAuth();
  return useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: fetchPortfolio,
    enabled: authenticated,
    staleTime: 15 * 1000,
    refetchInterval: (query) => pollMs ?? (query.state.data?.status === "unavailable" ? 10 * 1000 : 60 * 1000),
  });
}

export function useSavedBagIds() {
  const { authenticated } = useStockpileAuth();
  return useQuery({
    queryKey: queryKeys.saved,
    queryFn: fetchSavedBagIds,
    enabled: authenticated,
  });
}

/** Wallet history, newest first, paged by `nextCursor`. */
export function useActivity() {
  const { authenticated } = useStockpileAuth();
  return useInfiniteQuery({
    queryKey: queryKeys.activity,
    queryFn: ({ pageParam }) => fetchActivity(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.status === "live" ? page.nextCursor : null) ?? undefined,
    enabled: authenticated,
    staleTime: 30 * 1000,
  });
}

export function useToggleSaved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bagId, saved }: { bagId: string; saved: boolean }) =>
      saved ? unsaveBag(bagId) : saveBag(bagId),
    onMutate: async ({ bagId, saved }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.saved });
      const previous = queryClient.getQueryData<string[]>(queryKeys.saved);
      const current = previous ?? [];
      queryClient.setQueryData<string[]>(
        queryKeys.saved,
        saved ? current.filter((id) => id !== bagId) : [...current, bagId],
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(queryKeys.saved, context?.previous);
    },
    onSuccess: (bagIds) => {
      queryClient.setQueryData(queryKeys.saved, bagIds);
    },
  });
}
