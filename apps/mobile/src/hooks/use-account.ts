import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStockpileAuth } from "@/providers/auth-context";
import {
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

export function usePortfolio() {
  const { authenticated } = useStockpileAuth();
  return useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: fetchPortfolio,
    enabled: authenticated,
    staleTime: 30 * 1000,
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
