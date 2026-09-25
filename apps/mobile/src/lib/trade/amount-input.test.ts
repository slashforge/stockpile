import { describe, expect, test } from "bun:test";
import {
  applyAmountKey,
  clampAmountDecimals,
  formatAmountInput,
} from "./amount-input";

const typeKeys = (keys: string, start = "") =>
  [...keys].reduce(
    (value, key) =>
      applyAmountKey(value, (key === "<" ? "delete" : key) as never),
    start,
  );

describe("applyAmountKey", () => {
  test("builds whole and decimal amounts", () => {
    expect(typeKeys("25")).toBe("25");
    expect(typeKeys("12.5")).toBe("12.5");
    expect(typeKeys(".5")).toBe("0.5");
  });

  test("caps at 2 decimals and one separator", () => {
    expect(typeKeys("1.239")).toBe("1.23");
    expect(typeKeys("1..2")).toBe("1.2");
  });

  test("drops leading zeros but keeps 0.x", () => {
    expect(typeKeys("007")).toBe("7");
    expect(typeKeys("0.05")).toBe("0.05");
  });

  test("backspace removes the last character", () => {
    expect(typeKeys("12.5<<")).toBe("12");
    expect(typeKeys("<")).toBe("");
  });

  test("limits whole digits", () => {
    expect(typeKeys("12345678901")).toBe("123456789");
  });
});

describe("formatAmountInput", () => {
  test("groups the whole part and keeps typed decimals", () => {
    expect(formatAmountInput("")).toBe("0");
    expect(formatAmountInput("1234")).toBe("1,234");
    expect(formatAmountInput("1234.")).toBe("1,234.");
    expect(formatAmountInput("1234.5")).toBe("1,234.5");
  });
});

describe("clampAmountDecimals", () => {
  test("truncates to 2 decimals without rounding", () => {
    expect(clampAmountDecimals("12.345678")).toBe("12.34");
    expect(clampAmountDecimals("1,000.999")).toBe("1000.99");
    expect(clampAmountDecimals("5.000000")).toBe("5");
  });
});
