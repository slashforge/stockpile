import type { Bag, BagAsset } from "@/services/api/types";

/** PreStocks pre-IPO support, from the generated contract (`issuer`, `assetClass`, `reference`). */

export function isPreIpoAsset(asset: Pick<BagAsset, "assetClass" | "issuer">): boolean {
  return asset.assetClass === "pre-ipo" || asset.issuer === "prestocks";
}

export function isPreIpoBag(bag: Pick<Bag, "assetClass" | "issuer" | "assets">): boolean {
  return bag.assetClass === "pre-ipo" || bag.issuer === "prestocks" || bag.assets.some(isPreIpoAsset);
}

function formatUsd(value: number): string {
  const whole = value >= 1000;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/**
 * "Issuer mark $X" for assets with an issuer-reported reference. Display only: this is PreStocks'
 * published mark, never a live or executable quote, so it must not feed any amount or trade math.
 */
export function issuerMarkLabel(asset: Pick<BagAsset, "reference">): string | null {
  const mark = asset.reference?.markPrice;
  return typeof mark === "number" && Number.isFinite(mark) && mark > 0 ? `Issuer mark ${formatUsd(mark)}` : null;
}

/** One-line risk note for the buy review step on pre-IPO bags. */
export const PRE_IPO_REVIEW_NOTE =
  "Pre-IPO tokens track SPV exposure: no shareholder rights, not for U.S. persons, and liquidity can be very thin.";
