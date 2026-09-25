import type { BagReturnEntry } from "@/services/api/returns";

export type CardReturn = {
  /** Short label shown next to the figure: "1M", "1Y", "since Dec '25", "since listing". */
  label: string;
  pct: number;
};

export type CardReturns = { primary: CardReturn; secondary?: CardReturn };

/** A bag first indexed within this many days reads as "since listing". */
const LISTING_WINDOW_DAYS = 35;

/** The API reports 1Y (= ALL) for younger bags; only trust it once history spans ~a year. */
const YEAR_WINDOW_DAYS = 360;

function ageDays(since: string | null, now: Date): number | null {
  const date = since ? new Date(since) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return (now.getTime() - date.getTime()) / 86_400_000;
}

/** "since Dec '25", or "since listing" when the history is barely older than a month. */
export function sinceLabel(since: string | null, now: Date): string {
  const age = ageDays(since, now);
  if (since == null || age == null || age <= LISTING_WINDOW_DAYS) return "since listing";
  const date = new Date(since);
  const month = date.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `since ${month} '${String(date.getUTCFullYear()).slice(-2)}`;
}

/**
 * Card headline: 1M first, then 1Y or the all-time figure as a quieter second line. When 1M is
 * missing the all-time figure is promoted; null when the bag has no history at all.
 */
export function pickCardReturns(
  entry: BagReturnEntry | null | undefined,
  now = new Date(),
): CardReturns | null {
  if (!entry) return null;
  const all =
    entry.ALL != null ? { label: sinceLabel(entry.since, now), pct: entry.ALL } : null;
  if (entry["1M"] == null) return all ? { primary: all } : null;
  const primary = { label: "1M", pct: entry["1M"] };
  const age = ageDays(entry.since, now);
  if (entry["1Y"] != null && (age == null || age >= YEAR_WINDOW_DAYS))
    return { primary, secondary: { label: "1Y", pct: entry["1Y"] } };
  return all ? { primary, secondary: all } : { primary };
}
