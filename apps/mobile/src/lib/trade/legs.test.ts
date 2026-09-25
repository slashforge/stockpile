/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { USDC_MINT } from "@/lib/solana/transaction";
import type { Bag, QuoteLeg } from "@/services/api/types";
import { legLabelProblems, totalInput, totalOutput, tradeErrorMessage } from "./legs";

const bag = {
  assets: [
    {
      symbol: "AAPLx",
      name: "Apple",
      weightBps: 5000,
      mint: "MintA",
      sourceUrl: "",
      iconUrl: null,
      iconSource: null,
      brandColor: null,
      decimals: 8,
      uiAmountMultiplier: 1,
      issuer: "xstocks" as const,
      assetClass: "public-equity" as const,
      reference: null,
      market: null,
      liquidityTier: null,
      evidence: [],
    },
    {
      symbol: "NVDAx",
      name: "NVIDIA",
      weightBps: 5000,
      mint: "MintN",
      sourceUrl: "",
      iconUrl: null,
      iconSource: null,
      brandColor: null,
      decimals: 8,
      uiAmountMultiplier: 1,
      issuer: "xstocks" as const,
      assetClass: "public-equity" as const,
      reference: null,
      market: null,
      liquidityTier: null,
      evidence: [],
    },
  ],
};

const leg = (overrides: Partial<QuoteLeg> = {}): QuoteLeg => ({
  index: 0,
  symbol: "AAPLx",
  weightBps: 5000,
  inputMint: USDC_MINT,
  outputMint: "MintA",
  outputDecimals: 8,
  uiAmountMultiplier: 1,
  inputAmount: "5000000",
  outAmount: "20000",
  minOutAmount: "19800",
  priceImpactPct: "0",
  routeSteps: 1,
  ...overrides,
});

describe("legLabelProblems", () => {
  test("accepts a leg consistent with the bag", () => {
    expect(legLabelProblems(leg(), bag, 0, 2)).toEqual([]);
  });
  test("blocks a token outside the bag", () => {
    expect(
      legLabelProblems(leg({ outputMint: "Other" }), bag, 0, 2).length,
    ).toBeGreaterThan(0);
  });
  test("blocks a mismatched symbol label", () => {
    expect(
      legLabelProblems(leg({ symbol: "NVDAx" }), bag, 0, 2).length,
    ).toBeGreaterThan(0);
  });
  test("blocks a non-USDC input and wrong order", () => {
    expect(
      legLabelProblems(leg({ inputMint: "SOL" }), bag, 0, 2).length,
    ).toBeGreaterThan(0);
    expect(
      legLabelProblems(leg({ index: 1 }), bag, 0, 2).length,
    ).toBeGreaterThan(0);
  });
});

test("totalInput sums legs exactly", () => {
  expect(totalInput([leg(), leg({ inputAmount: "5000001" })])).toBe(10000001n);
});

test("tradeErrorMessage prefers friendly copy and names the token", () => {
  expect(
    tradeErrorMessage(
      { code: "NO_ROUTE", message: "raw", legIndex: 1, symbol: "NVDAx" },
      null,
    ),
  ).toContain("(NVDAx)");
  expect(tradeErrorMessage(null, "server says")).toBe("server says");
});

describe("price impact", () => {
  const { impactPercent, impactLevel, highImpactLegs } =
    require("./legs") as typeof import("./legs");
  test("reads Jupiter's fraction string as a percentage", () => {
    expect(impactPercent("0.0214")).toBeCloseTo(2.14);
    expect(impactPercent("0")).toBe(0);
    expect(impactPercent(null)).toBeNull();
    expect(impactPercent("abc")).toBeNull();
  });
  test("warns at 1% and requires confirmation at 5%", () => {
    expect(impactLevel("0.0099")).toBe("ok");
    expect(impactLevel("0.01")).toBe("warn");
    expect(impactLevel("0.0499")).toBe("warn");
    expect(impactLevel("0.05")).toBe("high");
    expect(impactLevel("-0.08")).toBe("high");
    expect(impactLevel(null)).toBe("unknown");
  });
  test("highImpactLegs picks only the legs that need confirmation", () => {
    const legs = [
      { symbol: "NVDAx", priceImpactPct: "0.0019" },
      { symbol: "AMDx", priceImpactPct: "0.0214" },
      { symbol: "NFLXx", priceImpactPct: "0.071" },
    ];
    expect(highImpactLegs(legs).map((leg) => leg.symbol)).toEqual(["NFLXx"]);
  });
});

test("every trade error code has friendly copy", () => {
  const codes = [
    "NO_WALLET",
    "UNSUPPORTED_INPUT_MINT",
    "PROVIDER_NOT_CONFIGURED",
    "BAG_NOT_TRADABLE",
    "AMOUNT_TOO_SMALL",
    "NO_ROUTE",
    "TOKEN_NOT_TRADABLE",
    "SLIPPAGE_REJECTED",
    "QUOTE_MISMATCH",
    "PROVIDER_ERROR",
    "PROVIDER_TIMEOUT",
    "INVALID_TRANSACTION",
  ] as const;
  for (const code of codes) {
    const message = tradeErrorMessage(
      { code, message: `raw ${code}`, legIndex: null, symbol: null },
      null,
    );
    expect(message).not.toContain("raw ");
  }
});

describe("sell legs", () => {
  const sellBag = { assets: [{ mint: "AAPL", symbol: "AAPLx" }] } as unknown as Pick<Bag, "assets">;
  const sellLeg = {
    index: 0,
    symbol: "AAPLx",
    weightBps: 10000,
    inputMint: "AAPL",
    outputMint: USDC_MINT,
    outputDecimals: 6,
    uiAmountMultiplier: 1,
    inputAmount: "100",
    outAmount: "5000000",
    minOutAmount: null,
    priceImpactPct: null,
    routeSteps: 1,
  };

  test("a sell leg must sell a bag token into USDC", () => {
    expect(legLabelProblems(sellLeg, sellBag, 0, 1, "sell")).toEqual([]);
    expect(legLabelProblems({ ...sellLeg, outputMint: "OTHER" }, sellBag, 0, 1, "sell")).toContain(
      "This transaction doesn’t pay out USDC.",
    );
    expect(legLabelProblems(sellLeg, sellBag, 0, 1, "buy").length).toBeGreaterThan(0);
  });

  test("totals the USDC out", () => {
    expect(totalOutput([sellLeg, { ...sellLeg, outAmount: "1" }])).toBe(5000001n);
  });
});
