import { describe, expect, test } from "bun:test";
import type { BagAsset } from "@/services/api/types";
import { isPreIpoAsset, isPreIpoBag, issuerMarkLabel } from "./pre-ipo";

const asset = (extra: Partial<BagAsset> = {}): BagAsset => ({
  symbol: "NVDAx",
  name: "NVIDIA",
  weightBps: 5000,
  mint: null,
  decimals: 8,
  uiAmountMultiplier: 1,
  issuer: "xstocks",
  assetClass: "public-equity",
  reference: null,
  market: null,
  liquidityTier: null,
  evidence: [],
  sourceUrl: "https://example.com",
  iconUrl: null,
  iconSource: null,
  brandColor: null,
  ...extra,
});

const reference = {
  markPrice: 42.5,
  tokenPrice: 42.5,
  impliedValuation: 300_000_000_000,
  asOf: "2026-09-01",
};

describe("pre-IPO detection", () => {
  test("public equities are not pre-IPO", () => {
    expect(isPreIpoAsset(asset())).toBe(false);
    expect(
      isPreIpoBag({
        issuer: "xstocks",
        assetClass: "public-equity",
        assets: [asset()],
      }),
    ).toBe(false);
  });

  test("detects by asset class, issuer, or bag level", () => {
    expect(isPreIpoAsset(asset({ assetClass: "pre-ipo" }))).toBe(true);
    expect(isPreIpoAsset(asset({ issuer: "prestocks" }))).toBe(true);
    expect(
      isPreIpoBag({ issuer: "prestocks", assetClass: "pre-ipo", assets: [] }),
    ).toBe(true);
    expect(
      isPreIpoBag({
        issuer: "xstocks",
        assetClass: "public-equity",
        assets: [asset(), asset({ issuer: "prestocks" })],
      }),
    ).toBe(true);
  });
});

describe("issuerMarkLabel", () => {
  test("no reference or non-positive marks show nothing", () => {
    expect(issuerMarkLabel(asset())).toBeNull();
    expect(
      issuerMarkLabel(asset({ reference: { ...reference, markPrice: 0 } })),
    ).toBeNull();
    expect(
      issuerMarkLabel(
        asset({ reference: { ...reference, markPrice: Number.NaN } }),
      ),
    ).toBeNull();
  });

  test("formats the issuer mark", () => {
    expect(issuerMarkLabel(asset({ reference }))).toBe("Issuer mark $42.50");
    expect(
      issuerMarkLabel(asset({ reference: { ...reference, markPrice: 1250 } })),
    ).toBe("Issuer mark $1,250");
  });
});
