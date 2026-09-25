import { describe, expect, test } from "bun:test";
import type { Activity } from "@/services/api/types";
import {
  activityVisual,
  describeActivity,
  flattenActivity,
  formatHoldingAmount,
  formatUsdValue,
  relativeTime,
} from "./portfolio";

describe("formatHoldingAmount", () => {
  test("keeps small amounts to 4 significant digits", () => {
    expect(formatHoldingAmount("0.016548")).toBe("0.01655");
    expect(formatHoldingAmount("0.002823")).toBe("0.002823");
    expect(formatHoldingAmount("0.0000001234567")).toBe("0.0000001235");
  });
  test("keeps larger amounts to 6 significant digits, grouped, trailing zeros dropped", () => {
    expect(formatHoldingAmount("10")).toBe("10");
    expect(formatHoldingAmount("5.000000")).toBe("5");
    expect(formatHoldingAmount("1234.5678")).toBe("1,234.57");
    expect(formatHoldingAmount("1234567.89")).toBe("1,234,568");
  });
  test("zero and junk", () => {
    expect(formatHoldingAmount("0")).toBe("0");
    expect(formatHoldingAmount("abc")).toBe("abc");
  });
});

const item = (signature: string): Activity => ({
  signature,
  ts: null,
  kind: "transfer-in",
  status: "confirmed",
  summary: "Received",
  legs: [],
  feeLamports: 0,
  bagId: null,
  bagLinked: false,
  explorerUrl: `https://solscan.io/tx/${signature}`,
});

describe("formatUsdValue", () => {
  test("em dash when unpriced", () => {
    expect(formatUsdValue(null)).toBe("—");
    expect(formatUsdValue(undefined)).toBe("—");
    expect(formatUsdValue(Number.NaN)).toBe("—");
  });
  test("two decimals with grouping", () => {
    expect(formatUsdValue(10)).toBe("$10.00");
    expect(formatUsdValue(1234.5)).toBe("$1,234.50");
    expect(formatUsdValue(0)).toBe("$0.00");
  });
  test("tiny non-zero values are not shown as $0.00", () => {
    expect(formatUsdValue(0.004)).toBe("<$0.01");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");
  test("buckets", () => {
    expect(relativeTime("2026-09-25T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("2026-09-25T11:55:00Z", now)).toBe("5m ago");
    expect(relativeTime("2026-09-25T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-09-23T12:00:00Z", now)).toBe("2d ago");
    expect(relativeTime("2026-08-01T12:00:00Z", now)).toBe("Aug 1");
    expect(relativeTime("2025-08-01T12:00:00Z", now)).toBe("Aug 1, 2025");
  });
  test("future clamps to just now; missing/invalid hides", () => {
    expect(relativeTime("2026-09-25T12:05:00Z", now)).toBe("just now");
    expect(relativeTime(null, now)).toBeNull();
    expect(relativeTime("nope", now)).toBeNull();
  });
});

describe("activityVisual", () => {
  test("by kind, failed overrides", () => {
    expect(activityVisual({ kind: "swap", status: "confirmed" }).icon).toBe("swap-horizontal");
    expect(activityVisual({ kind: "transfer-in", status: "confirmed" }).icon).toBe("arrow-down");
    expect(activityVisual({ kind: "transfer-out", status: "confirmed" }).icon).toBe("arrow-up");
    expect(activityVisual({ kind: "other", status: "confirmed" }).icon).toBe("ellipsis-horizontal");
    expect(activityVisual({ kind: "swap", status: "failed" })).toEqual({ icon: "close", tone: "danger" });
  });
});

describe("describeActivity", () => {
  const leg = (symbol: string, amount: string, direction: "in" | "out") => ({ mint: `${symbol}mint`, symbol, amount, direction });
  test("buy with USDC: title names the asset, amounts split by side", () => {
    expect(
      describeActivity({ kind: "swap", status: "confirmed", summary: "", legs: [leg("USDC", "2.5", "out"), leg("POLYMARKET", "0.016548", "in")] }),
    ).toEqual({ title: "Bought POLYMARKET", primary: { text: "+0.01655", tone: "positive" }, secondary: "-2.5 USDC" });
  });
  test("sell to USDC and asset-to-asset swap", () => {
    expect(describeActivity({ kind: "swap", status: "confirmed", summary: "", legs: [leg("KALSHI", "1", "out"), leg("USDC", "3", "in")] })).toEqual({
      title: "Sold KALSHI",
      primary: { text: "+3 USDC", tone: "positive" },
      secondary: "-1",
    });
    expect(describeActivity({ kind: "swap", status: "confirmed", summary: "", legs: [leg("SOL", "1", "out"), leg("NVDAx", "3", "in")] }).title).toBe("Swapped NVDAx");
  });
  test("transfers and fallback", () => {
    expect(describeActivity({ kind: "transfer-in", status: "confirmed", summary: "", legs: [leg("SOL", "0.02", "in")] })).toEqual({
      title: "Received SOL",
      primary: { text: "+0.02", tone: "positive" },
      secondary: null,
    });
    expect(describeActivity({ kind: "transfer-out", status: "confirmed", summary: "", legs: [leg("USDC", "10", "out")] }).primary).toEqual({ text: "-10", tone: "neutral" });
    expect(describeActivity({ kind: "other", status: "confirmed", summary: "Jupiter", legs: [] })).toEqual({ title: "Jupiter", primary: null, secondary: null });
    expect(describeActivity({ kind: "transfer-in", status: "confirmed", summary: "", legs: [{ mint: "So11111111111111111111111111111111111111112", symbol: null, amount: "1", direction: "in" }] }).title).toBe("Received So11…1112");
  });
});

describe("flattenActivity", () => {
  test("keeps order and drops repeated signatures across pages", () => {
    const pages = [{ items: [item("a"), item("b")] }, { items: [item("b"), item("c")] }];
    expect(flattenActivity(pages).map((entry) => entry.signature)).toEqual(["a", "b", "c"]);
    expect(flattenActivity(undefined)).toEqual([]);
  });
});
