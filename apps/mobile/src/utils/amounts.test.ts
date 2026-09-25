/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { formatBaseUnits, formatBps, formatTokenAmount, formatUiAmount, shortAddress, toBaseUnits } from "./amounts";

describe("toBaseUnits", () => {
  test("converts decimals exactly", () => {
    expect(toBaseUnits("25", 6)).toBe("25000000");
    expect(toBaseUnits("0.1", 6)).toBe("100000");
    expect(toBaseUnits("1,000.50", 6)).toBe("1000500000");
    expect(toBaseUnits(".5", 6)).toBe("500000");
  });

  test("rejects invalid, zero or over-precise input", () => {
    expect(toBaseUnits("", 6)).toBeNull();
    expect(toBaseUnits("0", 6)).toBeNull();
    expect(toBaseUnits("abc", 6)).toBeNull();
    expect(toBaseUnits("1.2345678", 6)).toBeNull();
    expect(toBaseUnits("-1", 6)).toBeNull();
  });
});

describe("formatBaseUnits", () => {
  test("formats raw units", () => {
    expect(formatBaseUnits("25000000", 6)).toBe("25");
    expect(formatBaseUnits("1234567", 6)).toBe("1.234567");
    expect(formatBaseUnits("5", 9)).toBe("0");
    expect(formatBaseUnits("5", 9, 9)).toBe("0.000000005");
    expect(formatBaseUnits("1000000000000", 6)).toBe("1,000,000");
  });
});

test("formatBps", () => {
  expect(formatBps(2500)).toBe("25%");
  expect(formatBps(1250)).toBe("12.5%");
});

test("shortAddress", () => {
  expect(shortAddress("So11111111111111111111111111111111111111112")).toBe("So11…1112");
});

test("formatMoney always shows two decimals and never rounds up", () => {
  const { formatMoney } = require("./amounts") as typeof import("./amounts");
  expect(formatMoney("0", 6)).toBe("0.00");
  expect(formatMoney("25000000", 6)).toBe("25.00");
  expect(formatMoney("1999999", 6)).toBe("1.99");
  expect(formatMoney("1234567890000", 6)).toBe("1,234,567.89");
});

describe("formatTokenAmount", () => {
  test("multiplier 1 matches plain base-unit formatting", () => {
    expect(formatTokenAmount("123456789", 8)).toBe("1.234567");
    expect(formatTokenAmount("123456789", 8, 1)).toBe("1.234567");
  });

  test("applies Token-2022 scaled UI multipliers exactly", () => {
    // 1 OPENAI raw token (8 decimals) at x1.486 displays as 1.486
    expect(formatTokenAmount("100000000", 8, 1.486)).toBe("1.486");
    // SPACEX x5
    expect(formatTokenAmount("250000000", 8, 5)).toBe("12.5");
    // no float drift: 0.1 * 3 style inputs stay exact
    expect(formatTokenAmount("3", 1, 1.1)).toBe("0.33");
  });

  test("truncates rather than rounds and ignores invalid multipliers", () => {
    expect(formatTokenAmount("1", 6, 1.9999999)).toBe("0.000001");
    expect(formatTokenAmount("1000000", 6, 0)).toBe("1");
    expect(formatTokenAmount("1000000", 6, Number.NaN)).toBe("1");
  });
});

describe("formatUiAmount", () => {
  test("groups and trims scaled decimal strings", () => {
    expect(formatUiAmount("1234.5")).toBe("1,234.5");
    expect(formatUiAmount("0.000000123")).toBe("0");
    expect(formatUiAmount("7")).toBe("7");
    expect(formatUiAmount("n/a")).toBe("n/a");
  });
});
