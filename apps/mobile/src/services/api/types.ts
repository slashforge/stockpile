import type { Bag } from "@stockpile/api-client";

// Domain types come straight from the generated SDK (docs/api-contract.md), so any contract change
// surfaces as a type error instead of silently dropping fields at runtime.
export type {
  Activity,
  ActivityError,
  ActivityLeg,
  ActivityResponse as ActivityPage,
  Bag,
  BagAsset,
  BagHistoryResponse as BagHistory,
  Balance,
  Holding,
  PreparedTransaction,
  QuoteLeg,
  Story,
  StoryBagConnection,
  TradeError,
  TradeRequest,
  User as Me,
  PortfolioResponse as Portfolio,
  QuoteResponse as TradeQuote,
  PrepareResponse as PreparedTrade,
} from "@stockpile/api-client";

export type BagSource = Bag["sources"][number];
export type HistoryRange =
  import("@stockpile/api-client").BagHistoryResponse["range"];
