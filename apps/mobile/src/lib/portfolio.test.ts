import { describe, expect, test } from "bun:test";
import type { Activity } from "@/services/api/types";
import { activityVisual, flattenActivity, formatHoldingAmount, formatUsdValue, relativeTime } from "./portfolio";

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

describe("flattenActivity", () => {
  test("keeps order and drops repeated signatures across pages", () => {
    const pages = [{ items: [item("a"), item("b")] }, { items: [item("b"), item("c")] }];
    expect(flattenActivity(pages).map((entry) => entry.signature)).toEqual(["a", "b", "c"]);
    expect(flattenActivity(undefined)).toEqual([]);
  });
});
