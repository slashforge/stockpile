export const queryKeys = {
  bags: ["bags"] as const,
  bag: (id: string) => ["bags", id] as const,
  bagReturns: ["bag-returns"] as const,
  bagChart: (id: string, range: string) =>
    ["bags", id, "chart", range] as const,
  assetChart: (mint: string, range: string) =>
    ["assets", mint, "chart", range] as const,
  feed: ["feed"] as const,
  bagStories: (id: string) => ["feed", "bag", id] as const,
  me: ["private", "me"] as const,
  saved: ["private", "saved-bags"] as const,
  portfolio: ["private", "portfolio"] as const,
  activity: ["private", "activity"] as const,
  positions: ["private", "positions"] as const,
  sellQuote: (bagId: string, portionBps: number, slippageBps: number) =>
    ["private", "sell-quote", bagId, portionBps, slippageBps] as const,
  mintDecimals: (mints: string[]) =>
    ["solana", "mint-decimals", ...mints] as const,
};

/** Prefix for every query that depends on the signed-in user. Removed on sign-out. */
export const PRIVATE_QUERY_PREFIX = ["private"] as const;
