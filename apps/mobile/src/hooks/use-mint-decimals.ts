import { useQuery } from "@tanstack/react-query";
import { fetchMintDecimals } from "@/lib/solana/rpc";
import { queryKeys } from "./query-keys";

/** On-chain decimals for SPL mints, used to display raw quote amounts. */
export function useMintDecimals(mints: string[]) {
  const sorted = Array.from(new Set(mints)).sort();
  return useQuery({
    queryKey: queryKeys.mintDecimals(sorted),
    queryFn: () => fetchMintDecimals(sorted),
    enabled: sorted.length > 0,
    staleTime: Infinity,
    retry: 1,
  });
}
