import type {
  AssetChartResponse,
  BagChartResponse,
  ChartRange,
  ChartReason,
} from "@stockpile/api-client";
import {
  getAssetChart as sdkGetAssetChart,
  getBagChart as sdkGetBagChart,
} from "./client";
import { unwrap } from "./stockpile";

export type { ChartRange };
export const CHART_RANGES: ChartRange[] = ["1D", "1W", "1M", "ALL"];

/** Chart-ready point: epoch ms + value, as react-native-wagmi-charts expects. */
export type ChartPoint = { timestamp: number; value: number };

export type ChartSeries = {
  points: ChartPoint[];
  changePct: number | null;
  reason: ChartReason;
};

export type ChartLeg = {
  mint: string | null;
  symbol: string;
  /** Null when the leg has no usable series for the range. */
  changePct: number | null;
};

export type BagChart = ChartSeries & { legs: ChartLeg[] };

export function toEpochMs(t: number | string): number {
  if (typeof t === "string") {
    const numeric = Number(t);
    if (t.trim() !== "" && Number.isFinite(numeric)) return toEpochMs(numeric);
    return Date.parse(t);
  }
  // API timestamps are unix seconds; tolerate milliseconds.
  return t < 1e12 ? t * 1000 : t;
}

/** Drops non-finite points, sorts ascending and keeps the last value per timestamp. */
export function normalizePoints(
  raw: { t: number | string; value: number }[] | undefined,
): ChartPoint[] {
  const points = (raw ?? [])
    .map((point) => ({ timestamp: toEpochMs(point.t), value: Number(point.value) }))
    .filter(
      (point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const deduped: ChartPoint[] = [];
  for (const point of points) {
    if (deduped.at(-1)?.timestamp === point.timestamp) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return deduped;
}

/** A chart is only worth drawing with at least two distinct points. */
export function isDrawable(points: ChartPoint[] | undefined): points is ChartPoint[] {
  return (points?.length ?? 0) >= 2;
}

function finitePct(change: { pct: number } | null | undefined): number | null {
  return change && Number.isFinite(change.pct) ? change.pct : null;
}

export function parseBagChart(data: BagChartResponse): BagChart {
  return {
    points: normalizePoints(data.points),
    changePct: finitePct(data.change),
    reason: data.reason,
    legs: (data.legs ?? []).map((leg) => ({
      mint: leg.mint,
      symbol: leg.symbol,
      changePct: leg.ok ? finitePct(leg.change) : null,
    })),
  };
}

export function parseAssetChart(data: AssetChartResponse): ChartSeries {
  return {
    points: normalizePoints(
      (data.points ?? []).map((point) => ({ t: point.t, value: point.close })),
    ),
    changePct: finitePct(data.change),
    reason: data.reason,
  };
}

export async function fetchBagChart(id: string, range: ChartRange): Promise<BagChart> {
  return parseBagChart(
    await unwrap(sdkGetBagChart({ path: { id }, query: { range } })),
  );
}

export async function fetchAssetChart(mint: string, range: ChartRange): Promise<ChartSeries> {
  return parseAssetChart(
    await unwrap(sdkGetAssetChart({ path: { mint }, query: { range } })),
  );
}
