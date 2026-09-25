/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  isDrawable,
  normalizePoints,
  parseAssetChart,
  parseBagChart,
  toEpochMs,
} from "./charts";

describe("chart parsing", () => {
  test("accepts seconds, milliseconds and ISO timestamps", () => {
    expect(toEpochMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toEpochMs("2024-01-01T00:00:00Z")).toBe(Date.UTC(2024, 0, 1));
  });

  test("sorts, drops non-finite values and de-duplicates timestamps", () => {
    const points = normalizePoints([
      { t: 3, value: 30 },
      { t: 1, value: 10 },
      { t: 2, value: Number.NaN },
      { t: 3, value: 31 },
    ]);
    expect(points).toEqual([
      { timestamp: 1000, value: 10 },
      { timestamp: 3000, value: 31 },
    ]);
  });

  test("fewer than two points is not drawable", () => {
    expect(isDrawable([])).toBe(false);
    expect(isDrawable([{ timestamp: 1, value: 1 }])).toBe(false);
    expect(isDrawable(undefined)).toBe(false);
  });

  test("unavailable bag chart keeps the reason; failed legs have no change", () => {
    const chart = parseBagChart({
      bagId: "b",
      range: "1W",
      interval: "1H",
      points: [],
      change: null,
      legs: [
        { mint: "m1", symbol: "AAA", weight: 0.5, weightBps: 5000, change: { pct: 3 }, ok: true, reason: null },
        { mint: "m2", symbol: "BBB", weight: 0.5, weightBps: 5000, change: { pct: 9 }, ok: false, reason: "unavailable" },
      ],
      source: "tokens.xyz",
      reason: "insufficient_data",
      asOf: null,
    });
    expect(chart.points).toEqual([]);
    expect(chart.changePct).toBeNull();
    expect(chart.reason).toBe("insufficient_data");
    expect(chart.legs.map((leg) => leg.changePct)).toEqual([3, null]);
  });

  test("asset chart maps close to value", () => {
    const chart = parseAssetChart({
      mint: "m",
      symbol: "AAA",
      range: "1D",
      interval: "15m",
      points: [
        { t: 2, close: 6 },
        { t: 1, close: 5 },
      ],
      candles: [],
      change: { abs: 1, pct: 20 },
      source: "tokens.xyz",
      reason: null,
      asOf: null,
    });
    expect(chart.points.map((point) => point.value)).toEqual([5, 6]);
    expect(chart.changePct).toBe(20);
  });
});
