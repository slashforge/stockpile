import { Hono } from "hono";
import { getJupiterClient } from "../lib/jupiter-ultra";
import {
  getJupiterTokensClient,
  WRAPPED_SOL_MINT,
  type TokenInfo,
} from "../lib/jupiter-tokens";

const app = new Hono();

export const NATIVE_SOL_MINT = "11111111111111111111111111111111";

export interface TokenBalance {
  mint: string;
  balance: string;
  uiBalance: number;
  usdValue: number | null;
  tokenAccountAddress: string | null;
  token: TokenInfo | null;
}

export interface BalancesResponse {
  solBalance: string;
  solUiBalance: number;
  solUsdValue: number | null;
  solToken: TokenInfo | null;
  tokens: TokenBalance[];
  totalUsdValue: number;
}

app.get("/:address", async (c) => {
  try {
    const address = c.req.param("address");

    if (!address) {
      return c.json({ error: "Missing address parameter" }, 400);
    }

    const ultraClient = getJupiterClient();
    const tokensClient = getJupiterTokensClient();

    const holdings = await ultraClient.holdings(address);

    const tokenMints = Object.keys(holdings.tokens);
    const allMints = [WRAPPED_SOL_MINT, ...tokenMints];

    let tokenInfoMap = new Map<string, TokenInfo>();

    if (allMints.length > 0) {
      const chunks: string[][] = [];
      for (let i = 0; i < allMints.length; i += 100) {
        chunks.push(allMints.slice(i, i + 100));
      }

      const tokenInfoResults = await Promise.all(
        chunks.map((chunk) => tokensClient.searchByMints(chunk))
      );

      for (const results of tokenInfoResults) {
        for (const token of results) {
          tokenInfoMap.set(token.id, token);
        }
      }
    }

    const wsolTokenInfo = tokenInfoMap.get(WRAPPED_SOL_MINT) || null;
    
    // Create a virtual Native SOL token info based on wSOL but with native ID and name
    const solToken: TokenInfo | null = wsolTokenInfo ? {
      ...wsolTokenInfo,
      id: NATIVE_SOL_MINT,
      name: "Solana",
      symbol: "SOL",
      // Keep price, icon, etc. from wSOL
    } : null;

    const solUsdPrice = solToken?.usdPrice || null;
    const solUsdValue = solUsdPrice ? holdings.uiAmount * solUsdPrice : null;

    let totalUsdValue = solUsdValue || 0;

    const tokens: TokenBalance[] = [];

    for (const [mint, accounts] of Object.entries(holdings.tokens)) {
      const tokenInfo = tokenInfoMap.get(mint) || null;
      const usdPrice = tokenInfo?.usdPrice || null;

      for (const account of accounts) {
        const usdValue = usdPrice ? account.uiAmount * usdPrice : null;
        if (usdValue) {
          totalUsdValue += usdValue;
        }

        tokens.push({
          mint,
          balance: account.amount,
          uiBalance: account.uiAmount,
          usdValue,
          tokenAccountAddress: account.account,
          token: tokenInfo,
        });
      }
    }

    tokens.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));

    const response: BalancesResponse = {
      solBalance: holdings.amount,
      solUiBalance: holdings.uiAmount,
      solUsdValue,
      solToken,
      tokens,
      totalUsdValue,
    };

    return c.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export default app;
