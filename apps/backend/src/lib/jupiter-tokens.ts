/// <reference path="../../sst-env.d.ts" />
import { Resource } from "sst";

export const JUPITER_TOKENS_BASE_URL = "https://api.jup.ag/tokens/v2";
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export interface TokenStats {
  priceChange: number | null;
  holderChange: number | null;
  liquidityChange: number | null;
  volumeChange: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  buyOrganicVolume: number | null;
  sellOrganicVolume: number | null;
  numBuys: number | null;
  numSells: number | null;
  numTraders: number | null;
  numOrganicBuyers: number | null;
  numNetBuyers: number | null;
}

export interface TokenAudit {
  isSus: boolean | null;
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  topHoldersPercentage: number | null;
  devBalancePercentage: number | null;
  devMigrations: number | null;
}

export interface FirstPool {
  id: string;
  createdAt: string;
}

export interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  dev: string | null;
  circSupply: number | null;
  totalSupply: number | null;
  tokenProgram: string;
  launchpad: string | null;
  partnerConfig: string | null;
  graduatedPool: string | null;
  graduatedAt: string | null;
  holderCount: number | null;
  fdv: number | null;
  mcap: number | null;
  usdPrice: number | null;
  priceBlockId: number | null;
  liquidity: number | null;
  stats5m: TokenStats;
  stats1h: TokenStats;
  stats6h: TokenStats;
  stats24h: TokenStats;
  firstPool: FirstPool | null;
  audit: TokenAudit;
  organicScore: number;
  organicScoreLabel: "high" | "medium" | "low";
  isVerified: boolean | null;
  cexes: string[] | null;
  tags: string[] | null;
  updatedAt: string;
}

export type SearchResponse = TokenInfo[];

export class JupiterTokensClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = JUPITER_TOKENS_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
    };
  }

  async searchByMints(mints: string[]): Promise<TokenInfo[]> {
    if (mints.length === 0) return [];
    if (mints.length > 100) {
      throw new Error("Maximum 100 mints per request");
    }

    const response = await fetch(
      `${this.baseUrl}/search?query=${mints.join(",")}`,
      { headers: this.headers() }
    );

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as SearchResponse;
  }

  async getVerifiedTokens(): Promise<TokenInfo[]> {
    const response = await fetch(`${this.baseUrl}/tag?query=verified`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as SearchResponse;
  }

  async getTrending(
    interval: "5m" | "1h" | "6h" | "24h" = "24h",
    limit: number = 50
  ): Promise<TokenInfo[]> {
    const response = await fetch(
      `${this.baseUrl}/toptrending/${interval}?limit=${limit}`,
      { headers: this.headers() }
    );

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as SearchResponse;
  }

  async getRecent(): Promise<TokenInfo[]> {
    const response = await fetch(`${this.baseUrl}/recent`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as SearchResponse;
  }
}

let jupiterTokensClient: JupiterTokensClient | null = null;

export function getJupiterTokensClient(): JupiterTokensClient {
  if (!jupiterTokensClient) {
    jupiterTokensClient = new JupiterTokensClient(Resource.JupiterApiKey.value);
  }
  return jupiterTokensClient;
}
