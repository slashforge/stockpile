import { afterEach, expect, it, mock } from "bun:test";
import { atomicToUi, readPortfolio, readRawHoldings } from "./portfolio";
import { resetConfig, setFeatures, setSecrets } from "./config";
import { marketSnapshot, resetMarketCache, trackMints } from "./market";
import { resetTokenMetaCache } from "./token-meta";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; resetConfig(); resetMarketCache(); resetTokenMetaCache(); });

it("uses the same cached scaled units for both holdings providers and excludes flagged values from net worth", async () => {
  const mint = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
  const programId = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  resetMarketCache(); resetTokenMetaCache(); setFeatures({ market: true, xstocks: false }); setSecrets({ JupiterApiKey: "test", HeliusApiKey: "test" }); trackMints([mint]);
  let fallback = false;
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/price/v3") return Response.json({ [mint]: { usdPrice: 100, scaledUiConfig: { multiplier: 10 } } });
    if (url.pathname === "/swap/v2/order") return Response.json({ outputMint: mint, priceImpactPct: "-0.001" });
    if (url.pathname === "/tokens/v2/search") return Response.json([{ id: mint, usdPrice: 100, decimals: 8 }]);
    if (url.pathname.startsWith("/swap/v2/holdings/")) return fallback ? new Response("down", { status: 503 }) : Response.json({ amount: "0", tokens: { [mint]: [{ amount: "100", decimals: 8, uiAmountString: "99", programId, excludeFromNetWorth: true }] } });
    return Response.json([{ id: 1, result: { value: 0 } }, { id: 2, result: { value: [] } }, { id: 3, result: { value: [{ account: { data: { parsed: { info: { mint, state: "frozen", tokenAmount: { amount: "100", decimals: 8, uiAmountString: "777" } } } } } }] } }]);
  }) as unknown as typeof fetch;
  await marketSnapshot();
  const portfolio = await readPortfolio("wallet");
  expect(portfolio.totalUsd).toBe(0);
  expect(portfolio.holdings[0]).toMatchObject({ amount: "100", uiAmount: "0.00001", usdValue: 0.001 });
  fallback = true;
  const raw = await readRawHoldings("wallet");
  expect(raw).toMatchObject({ ok: true, holdings: [{ uiAmount: "0.00001", isFrozen: true }] });
});

it("formats signed atomic amounts without losing the sign or decimal placement", () => {
  expect(atomicToUi(-10000n, 6)).toBe("-0.01");
  expect(atomicToUi("-1", 6)).toBe("-0.000001");
  expect(atomicToUi(-1234567n, 6)).toBe("-1.234567");
  expect(atomicToUi(-12n, 0)).toBe("-12");
  expect(atomicToUi(0n, 6)).toBe("0");
  expect(atomicToUi(10000n, 6)).toBe("0.01");
});

it("maps Jupiter holdings per account from raw units, preserving flags and dropping zero balances", async () => {
  setSecrets({ JupiterApiKey: "test", HeliusApiKey: undefined });
  const token = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", token2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  const calls = mock(async (input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe("https://api.jup.ag/swap/v2/holdings/wallet");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("test");
    return Response.json({ amount: "1500000000", tokens: { mint: [
      { account: "a", amount: "100", decimals: 8, uiAmountString: "0.00001", programId: token2022, isFrozen: true, excludeFromNetWorth: true },
      { account: "b", amount: "5", decimals: 6, uiAmountString: "invalid", programId: token },
      { account: "c", amount: "0", decimals: 6, uiAmountString: "0", programId: token },
    ] } });
  });
  globalThis.fetch = calls as unknown as typeof fetch;
  expect(await readRawHoldings("wallet")).toEqual({ ok: true, lamports: 1500000000, holdings: [
    { mint: "mint", amount: "100", decimals: 8, uiAmount: "0.000001", program: "token-2022", isFrozen: true, excludeFromNetWorth: true },
    { mint: "mint", amount: "5", decimals: 6, uiAmount: "0.000005", program: "token" },
  ] });
  expect(calls).toHaveBeenCalledTimes(1);
});

it("falls back to Helius when Jupiter is absent, fails, or returns malformed balances", async () => {
  for (const mode of ["absent", "unavailable", "malformed"]) {
    setSecrets({ JupiterApiKey: mode === "absent" ? undefined : "test", HeliusApiKey: "test" });
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input); calls.push(url);
      if (url.includes("api.jup.ag")) return mode === "unavailable" ? new Response("down", { status: 503 }) : Response.json({ amount: "NaN", tokens: {} });
      return Response.json([{ id: 1, result: { value: 123 } }, { id: 2, result: { value: [] } }, { id: 3, result: { value: [] } }]);
    }) as unknown as typeof fetch;
    expect(await readRawHoldings("wallet")).toEqual({ ok: true, lamports: 123, holdings: [] });
    expect(calls.length).toBe(mode === "absent" ? 1 : 2);
  }
});
