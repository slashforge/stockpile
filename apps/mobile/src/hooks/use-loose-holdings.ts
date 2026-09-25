import { useMemo } from "react";
import { looseHoldings } from "@/lib/portfolio";
import { USDC_MINT } from "@/lib/solana/transaction";
import { usePortfolio } from "./use-account";
import { usePositions } from "./use-positions";

/**
 * SPL tokens the wallet holds outside every bag position (USDC excluded: it's what you sell into).
 * Bag tokens live in their bag; only what's left over shows up here and can be sold directly.
 */
export function useLooseHoldings() {
  const portfolio = usePortfolio();
  const positions = usePositions();
  const positionsState = positions.isError ? null : positions.data;
  const holdings = useMemo(
    () =>
      portfolio.data?.status === "live"
        ? looseHoldings(
            portfolio.data.holdings.filter((holding) => holding.mint !== USDC_MINT),
            positionsState,
          )
        : [],
    [portfolio.data, positionsState],
  );
  return { holdings, portfolio, positions, settled: positions.isSuccess || positions.isError };
}
