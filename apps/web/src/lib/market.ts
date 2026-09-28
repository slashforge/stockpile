import type { Bag, BagAsset, Story } from "@/services/api/types";

import type {
  AssetMarket as GeneratedAssetMarket,
  BagMarket as GeneratedBagMarket,
  Change24hSource,
  Curator,
  Evidence,
  UnderlyingPrice,
} from "@stockpile/api-client";

/**
 * Market data, curator and evidence helpers over the generated contract. Nothing here is ever
 * invented: missing or non-finite values format as an em dash or hide the element.
 */
export type AssetMarket = NonNullable<GeneratedAssetMarket>;
export type BagMarket = NonNullable<GeneratedBagMarket>;
export type LiquidityTier = NonNullable<BagAsset["liquidityTier"]>;
export type DisclosureEvidence = Evidence;
export type { Change24hSource, Curator };

export const EM_DASH = "—";
/** Below this weight coverage the bag-level change is shown muted. */
export const LOW_COVERAGE = 0.6;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function bagMarket(bag: Bag): BagMarket | null {
  return bag.market ?? null;
}

export function assetMarket(asset: BagAsset): AssetMarket | null {
  return asset.market ?? null;
}

/** Editorial bags get no curator line; people and aggregates do. */
export function bagCurator(bag: Bag): Curator | null {
  return bag.curator?.name && bag.curator.kind !== "editorial"
    ? bag.curator
    : null;
}

export function disclosureEvidence(asset: BagAsset): DisclosureEvidence[] {
  return (asset.evidence ?? []).filter((item) => item.kind === "disclosure");
}

export function isDisclosureStory(story: Story): boolean {
  return story.format === "disclosure";
}

const UNDERLYING_LABEL: Record<NonNullable<UnderlyingPrice>["source"], string> =
  {
    pyth: "Stock price",
    "jupiter-stock": "Stock reference (Jupiter)",
    prestocks: "Issuer mark",
  };

/** "Stock price as of 3:42 PM": freshness of the reference the premium is measured against. */
export function underlyingCaption(
  underlying: UnderlyingPrice | undefined,
  now = new Date(),
): string | null {
  if (!underlying) return null;
  const asOf = formatAsOf(underlying.asOf, now);
  return asOf
    ? `${UNDERLYING_LABEL[underlying.source] ?? "Reference"} ${asOf}`
    : null;
}

const TXN_LABEL: Record<Evidence["txnType"], string> = {
  buy: "Purchase",
  sell: "Sale",
  exchange: "Exchange",
};

export type ChangeTone = "up" | "down" | "flat";

export function changeTone(pct: number | null | undefined): ChangeTone | null {
  if (!finite(pct)) return null;
  if (pct >= 0.05) return "up";
  if (pct <= -0.05) return "down";
  return "flat";
}

/** "+1.8%", "-0.4%", "0.0%"; em dash when unknown. Input is already a percentage. */
export function formatSignedPct(
  pct: number | null | undefined,
  digits = 1,
): string {
  if (!finite(pct)) return EM_DASH;
  const rounded = Number(pct.toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded).toFixed(digits)}%`;
}

/** Route price impact (already a percentage, unsigned): "2.2%", "<0.1%"; em dash when unknown. */
export function formatImpactPct(pct: number | null | undefined): string {
  if (!finite(pct)) return EM_DASH;
  const abs = Math.abs(pct);
  if (abs < 0.05) return "<0.1%";
  return `${abs.toFixed(1)}%`;
}

/** Compact USD: $3k, $1.2M, $840, $12.34 for sub-$100 prices. */
export function formatUsdCompact(value: number | null | undefined): string {
  if (!finite(value) || value < 0) return EM_DASH;
  if (value >= 1e9) return `$${trim(value / 1e9)}B`;
  if (value >= 1e6) return `$${trim(value / 1e6)}M`;
  if (value >= 1e3) return `$${trim(value / 1e3)}k`;
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function trim(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
}

export function formatPrice(value: number | null | undefined): string {
  if (!finite(value) || value <= 0) return EM_DASH;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });
}

/** "as of 3:42 PM" today, "as of Aug 12, 3:42 PM" otherwise; null when missing/invalid. */
export function formatAsOf(
  iso: string | null | undefined,
  now = new Date(),
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? `as of ${time}`
    : `as of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

/** Filing dates like "Aug 12"; the raw string when unparseable. */
export function formatShortDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Pelosi · Purchase · $1M–5M · disclosed Aug 12" */
export function evidenceLine(item: DisclosureEvidence): string {
  const disclosed = formatShortDate(item.disclosedDate);
  return [
    item.member,
    TXN_LABEL[item.txnType] ?? item.txnType,
    item.amountRange,
    disclosed ? `disclosed ${disclosed}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
