import { secret } from "./config";

export const JUPITER_SWAP_URL = "https://api.jup.ag/swap/v2";
export type OrderParams = { inputMint: string; outputMint: string; amount: string; taker?: string; payer?: string; closeAuthority?: string; excludeDexes?: string; excludeRouters?: string; priorityFeeLamports?: number; broadcastFeeType?: "maxCap"; slippageBps?: number };
export type JupiterOrder = { inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold?: string; slippageBps?: number; priceImpactPct?: string; priceImpact?: number; routePlan?: unknown[];
  transaction?: string | null; requestId?: string; router?: string; lastValidBlockHeight?: string | number; errorCode?: number | string; errorMessage?: string; error?: string };
export type JupiterExecution = { status?: "Success" | "Failed"; code?: number; signature?: string; error?: string };
export type JupiterHoldings = { amount: string; tokens: Record<string, { account: string; amount: string; uiAmountString?: unknown; decimals: number; programId: string; isFrozen?: boolean; excludeFromNetWorth?: boolean }[]> };

export class JupiterError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly code: number | string | null = null, readonly timeout = false) { super(message); this.name = "JupiterError"; }
}

async function request<T>(path: string, body?: unknown, timeout = 8000): Promise<T> {
  const key = secret("JupiterApiKey");
  if (!key) throw new JupiterError("Jupiter is not configured");
  let response: Response;
  try {
    response = await fetch(`${JUPITER_SWAP_URL}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "x-api-key": key, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeout) });
  } catch (error) { throw new JupiterError("Jupiter unavailable", null, null, error instanceof Error && /TimeoutError|AbortError/.test(error.name)); }
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  const code = data?.code ?? data?.errorCode;
  if (!response.ok) throw new JupiterError(typeof data?.error === "string" ? data.error : typeof data?.errorMessage === "string" ? data.errorMessage : `Jupiter ${response.status}`, response.status, typeof code === "number" || typeof code === "string" ? code : null);
  if (!data || typeof data !== "object") throw new JupiterError("Invalid Jupiter response");
  return data as T;
}

export function order(params: OrderParams): Promise<JupiterOrder> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  return request(`/order?${query}`);
}
export function execute(signedTransaction: string, requestId: string): Promise<JupiterExecution> { return request("/execute", { signedTransaction, requestId }, 30_000); }
export function holdings(address: string): Promise<JupiterHoldings> { return request(`/holdings/${encodeURIComponent(address)}`); }
