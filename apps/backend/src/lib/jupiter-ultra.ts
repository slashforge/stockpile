/// <reference path="../../sst-env.d.ts" />
import { Resource } from "sst";

export const JUPITER_ULTRA_BASE_URL = "https://api.jup.ag/ultra/v1";

export interface OrderParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker?: string;
  receiver?: string;
  payer?: string;
  closeAuthority?: string;
  referralAccount?: string;
  referralFee?: number;
  excludeRouters?: ("iris" | "jupiterz" | "dflow" | "okx")[];
  excludeDexes?: string;
  gasless?: boolean;
  swapMode?: "ExactIn" | "ExactOut";
}

export interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;
  bps: number;
  usdValue?: number;
}

export interface PlatformFee {
  feeBps: number;
  amount?: string;
}

export interface OrderResponse {
  mode: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: RoutePlan[];
  feeBps: number;
  platformFee: PlatformFee;
  signatureFeeLamports: number;
  signatureFeePayer: string | null;
  prioritizationFeeLamports: number;
  prioritizationFeePayer: string | null;
  rentFeeLamports: number;
  rentFeePayer: string | null;
  swapType: string;
  router: "iris" | "jupiterz" | "dflow" | "okx";
  transaction: string | null;
  gasless: boolean;
  requestId: string;
  totalTime: number;
  taker: string | null;
  inUsdValue?: number;
  outUsdValue?: number;
  priceImpact?: number;
  swapUsdValue?: number;
  referralAccount?: string;
  feeMint?: string;
  quoteId?: string;
  maker?: string;
  expireAt?: string;
  errorCode?: 1 | 2 | 3;
  errorMessage?: string;
}

export interface OrderErrorResponse {
  error: string;
}

export interface ExecuteRequest {
  signedTransaction: string;
  requestId: string;
}

export interface SwapEvent {
  inputMint: string;
  inputAmount: string;
  outputMint: string;
  outputAmount: string;
}

export interface ExecuteResponse {
  status: "Success" | "Failed";
  code: number;
  signature?: string;
  slot?: string;
  error?: string;
  totalInputAmount?: string;
  totalOutputAmount?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
  swapEvents?: SwapEvent[];
}

export interface TokenHolding {
  account: string;
  amount: string;
  uiAmount: number;
  uiAmountString: string;
  isFrozen: boolean;
  isAssociatedTokenAccount: boolean;
  decimals: number;
  programId: string;
}

export interface HoldingsResponse {
  amount: string;
  uiAmount: number;
  uiAmountString: string;
  tokens: {
    [mintAddress: string]: TokenHolding[];
  };
}

export interface HoldingsErrorResponse {
  error: string;
}

export interface Warning {
  type:
    | "NOT_VERIFIED"
    | "LOW_LIQUIDITY"
    | "NOT_SELLABLE"
    | "LOW_ORGANIC_ACTIVITY"
    | "HAS_MINT_AUTHORITY"
    | "HAS_FREEZE_AUTHORITY"
    | "HAS_PERMANENT_DELEGATE"
    | "NEW_LISTING"
    | "VERY_LOW_TRADING_ACTIVITY"
    | "HIGH_SUPPLY_CONCENTRATION"
    | "NON_TRANSFERABLE"
    | "MUTABLE_TRANSFER_FEES"
    | "SUSPICIOUS_DEV_ACTIVITY"
    | "SUSPICIOUS_TOP_HOLDER_ACTIVITY"
    | "HIGH_SINGLE_OWNERSHIP"
    | string;
  message: string;
  severity: "info" | "warning" | "critical";
  source?: "RugCheck";
}

export interface ShieldResponse {
  warnings: {
    [mintAddress: string]: Warning[];
  };
}

export interface TokenStats {
  priceChange?: number | null;
  holderChange?: number | null;
  liquidityChange?: number | null;
  volumeChange?: number | null;
  buyVolume?: number | null;
  sellVolume?: number | null;
  buyOrganicVolume?: number | null;
  sellOrganicVolume?: number | null;
  numBuys?: number | null;
  numSells?: number | null;
  numTraders?: number | null;
  numOrganicBuyers?: number | null;
  numNetBuyers?: number | null;
}

export interface TokenAudit {
  isSus?: boolean | null;
  mintAuthorityDisabled?: boolean | null;
  freezeAuthorityDisabled?: boolean | null;
  topHoldersPercentage?: number | null;
  devBalancePercentage?: number | null;
  devMigrations?: number | null;
}

export interface FirstPool {
  id: string;
  createdAt: string;
}

export interface TokenSearchResult {
  id: string;
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
  dev?: string | null;
  circSupply?: number | null;
  totalSupply?: number | null;
  tokenProgram: string;
  launchpad?: string | null;
  partnerConfig?: string | null;
  graduatedPool?: string | null;
  graduatedAt?: string | null;
  holderCount?: number | null;
  fdv?: number | null;
  mcap?: number | null;
  usdPrice?: number | null;
  priceBlockId?: number | null;
  liquidity?: number | null;
  stats5m?: TokenStats;
  stats1h?: TokenStats;
  stats6h?: TokenStats;
  stats24h?: TokenStats;
  firstPool?: FirstPool;
  audit?: TokenAudit;
  organicScore: number;
  organicScoreLabel: "high" | "medium" | "low";
  isVerified?: boolean | null;
  cexes?: string[] | null;
  tags?: string[] | null;
  updatedAt?: string;
}

export type SearchResponse = TokenSearchResult[];

export interface RouterInfo {
  id: string;
  name: "Iris" | "JupiterZ" | "DFlow" | "OKX DEX Router";
  icon: string;
}

export type RoutersResponse = RouterInfo[];

export class JupiterUltraClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = JUPITER_ULTRA_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async order(params: OrderParams): Promise<OrderResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set("inputMint", params.inputMint);
    queryParams.set("outputMint", params.outputMint);
    queryParams.set("amount", params.amount);
    if (params.taker) queryParams.set("taker", params.taker);
    if (params.receiver) queryParams.set("receiver", params.receiver);
    if (params.payer) queryParams.set("payer", params.payer);
    if (params.closeAuthority)
      queryParams.set("closeAuthority", params.closeAuthority);
    if (params.referralAccount)
      queryParams.set("referralAccount", params.referralAccount);
    if (params.referralFee !== undefined)
      queryParams.set("referralFee", params.referralFee.toString());
    if (params.excludeRouters?.length)
      queryParams.set("excludeRouters", params.excludeRouters.join(","));
    if (params.excludeDexes) queryParams.set("excludeDexes", params.excludeDexes);
    if (params.gasless !== undefined)
      queryParams.set("gasless", params.gasless ? "true" : "false");
    if (params.swapMode) queryParams.set("swapMode", params.swapMode);

    const url = `${this.baseUrl}/order?${queryParams}`;
    console.log("[Jupiter] Fetching order:", url);
    
    const response = await fetch(url, {
      headers: this.headers(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[Jupiter] Order error:", response.status, errorBody);
      try {
        const error = JSON.parse(errorBody) as { error?: string };
        throw new Error(error.error || `HTTP ${response.status}`);
      } catch {
        throw new Error(errorBody || `HTTP ${response.status}`);
      }
    }

    return (await response.json()) as OrderResponse;
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResponse> {
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as ExecuteResponse;
  }

  async holdings(address: string): Promise<HoldingsResponse> {
    const response = await fetch(`${this.baseUrl}/holdings/${address}`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as HoldingsResponse;
  }

  async shield(mints: string[]): Promise<ShieldResponse> {
    const response = await fetch(
      `${this.baseUrl}/shield?mints=${mints.join(",")}`,
      {
        headers: this.headers(),
      }
    );

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as ShieldResponse;
  }

  async search(query: string): Promise<SearchResponse> {
    const response = await fetch(
      `${this.baseUrl}/search?query=${encodeURIComponent(query)}`,
      {
        headers: this.headers(),
      }
    );

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as SearchResponse;
  }

  async routers(): Promise<RoutersResponse> {
    const response = await fetch(`${this.baseUrl}/order/routers`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as RoutersResponse;
  }
}

let jupiterClient: JupiterUltraClient | null = null;

export function getJupiterClient(): JupiterUltraClient {
  if (!jupiterClient) {
    jupiterClient = new JupiterUltraClient(Resource.JupiterApiKey.value);
  }
  return jupiterClient;
}
