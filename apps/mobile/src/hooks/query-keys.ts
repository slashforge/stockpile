export const queryKeys = {
  bags: ["bags"] as const,
  bag: (id: string) => ["bags", id] as const,
  feed: ["feed"] as const,
  bagStories: (id: string) => ["feed", "bag", id] as const,
  me: ["private", "me"] as const,
  saved: ["private", "saved-bags"] as const,
  portfolio: ["private", "portfolio"] as const,
  mintDecimals: (mints: string[]) => ["solana", "mint-decimals", ...mints] as const,
};

/** Prefix for every query that depends on the signed-in user. Removed on sign-out. */
export const PRIVATE_QUERY_PREFIX = ["private"] as const;
