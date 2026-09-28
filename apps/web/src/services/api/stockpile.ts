import {
  getBag as sdkGetBag,
  getMe as sdkGetMe,
  getPortfolio as sdkGetPortfolio,
  getTransactionStatuses as sdkGetTransactionStatuses,
  listActivity as sdkListActivity,
  listBags as sdkListBags,
  listSavedBags as sdkListSavedBags,
  prepareBagTrade as sdkPrepareBagTrade,
  prepareTokenSell as sdkPrepareTokenSell,
  quoteBagTrade as sdkQuoteBagTrade,
  quoteTokenSell as sdkQuoteTokenSell,
  removeSavedBag as sdkRemoveSavedBag,
  saveBag as sdkSaveBag,
  submitTransaction as sdkSubmitTransaction,
} from "./client";
import type {
  ActivityPage,
  Bag,
  Me,
  Portfolio,
  PreparedTrade,
  TokenSellPrepared,
  TokenSellQuote,
  TokenSellRequest,
  TradeQuote,
  TradeRequest,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  /** 503: backend has no Privy configuration. */
  get isAuthUnavailable() {
    return this.status === 503;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

type SdkResult<T> = { data?: T; error?: unknown; response?: Response };

function errorMessage(error: unknown, status: number): string {
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    typeof error.error === "string"
  ) {
    return error.error;
  }
  // Non-JSON bodies (plain text, HTML from proxies or a different service) are never shown verbatim.
  if (status === 401) return "Please sign in again.";
  if (status === 404)
    return "Not found. The server may not be the Stockpile API or may be out of date.";
  if (status === 503)
    return "This feature is not configured on the server yet.";
  return `Request failed (${status || "network"})`;
}

export async function unwrap<T>(call: Promise<SdkResult<T>>): Promise<T> {
  let result: SdkResult<T>;
  try {
    result = await call;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Can't reach Stockpile right now. Check your connection.",
      0,
    );
  }
  const status = result.response?.status ?? 0;
  if (
    result.error !== undefined ||
    result.data === undefined ||
    (status && status >= 400)
  ) {
    throw new ApiError(errorMessage(result.error, status), status);
  }
  return result.data;
}

export async function fetchBags(): Promise<Bag[]> {
  const data = await unwrap(sdkListBags());
  return data.bags;
}

export async function fetchBag(id: string): Promise<Bag> {
  const data = await unwrap(sdkGetBag({ path: { id } }));
  return data.bag;
}

export async function fetchMe(): Promise<Me> {
  const data = await unwrap(sdkGetMe());
  return data.user;
}

export async function fetchSavedBagIds(): Promise<string[]> {
  const data = await unwrap(sdkListSavedBags());
  return data.bagIds;
}

export async function saveBag(bagId: string): Promise<string[]> {
  const data = await unwrap(sdkSaveBag({ body: { bagId } }));
  return data.bagIds;
}

export async function unsaveBag(bagId: string): Promise<string[]> {
  const data = await unwrap(sdkRemoveSavedBag({ path: { bagId } }));
  return data.bagIds;
}

export async function fetchPortfolio(): Promise<Portfolio> {
  return unwrap(sdkGetPortfolio());
}

export async function fetchActivity(cursor?: string | null, limit = 20): Promise<ActivityPage> {
  return unwrap(sdkListActivity({ query: { limit, ...(cursor ? { cursor } : {}) } }));
}

export async function quoteTrade(body: TradeRequest): Promise<TradeQuote> {
  return unwrap(sdkQuoteBagTrade({ body }));
}

export async function prepareTrade(body: TradeRequest): Promise<PreparedTrade> {
  return unwrap(sdkPrepareBagTrade({ body }));
}

/** Quotes selling tokens held outside every bag (the server sizes each leg from the loose balance). */
export async function quoteTokenSell(body: TokenSellRequest): Promise<TokenSellQuote> {
  return unwrap(sdkQuoteTokenSell({ body }));
}

export async function prepareTokenSell(body: TokenSellRequest): Promise<TokenSellPrepared> {
  return unwrap(sdkPrepareTokenSell({ body }));
}

/** Broadcasts a wallet-signed transaction through Stockpile (Helius RPC + Sender); returns its signature. */
export async function submitSignedTransaction(transaction: string, bagId?: string): Promise<string> {
  const data = await unwrap(sdkSubmitTransaction({ body: { transaction, bagId } }));
  return data.signature;
}

export async function fetchTransactionStatuses(signatures: string[]) {
  const data = await unwrap(sdkGetTransactionStatuses({ body: { signatures } }));
  return data.statuses;
}
