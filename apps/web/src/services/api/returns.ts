import type { BagReturnsResponse } from "@stockpile/api-client";
import { normalizePoints } from "./charts";
import { getBagReturns as sdkGetBagReturns } from "./client";
import { unwrap } from "./stockpile";

/** Longer-horizon index returns for one bag. Percentages; null when the window has no history. */
export type BagReturnEntry = {
  "1M": number | null;
  "1Y": number | null;
  ALL: number | null;
  /** ISO date of the first index point. */
  since: string | null;
  /** 1M index values, oldest first. */
  sparkline: number[];
};

export type BagReturnsMap = Record<string, BagReturnEntry>;

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function parseBagReturns(data: BagReturnsResponse): BagReturnsMap {
  const out: BagReturnsMap = {};
  for (const [id, entry] of Object.entries(data.returns ?? {})) {
    if (!entry) continue;
    const since =
      entry.since && !Number.isNaN(Date.parse(entry.since)) ? entry.since : null;
    out[id] = {
      "1M": finiteOrNull(entry["1M"]),
      "1Y": finiteOrNull(entry["1Y"]),
      ALL: finiteOrNull(entry.ALL),
      since,
      sparkline: normalizePoints(entry.sparkline1M).map((point) => point.value),
    };
  }
  return out;
}

export async function fetchBagReturns(): Promise<BagReturnsMap> {
  return parseBagReturns(await unwrap(sdkGetBagReturns()));
}
