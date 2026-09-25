/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { BagReturnEntry } from "@/services/api/returns";
import { pickCardReturns, sinceLabel } from "./returns";

const NOW = new Date("2026-09-25T12:00:00Z");

function entry(overrides: Partial<BagReturnEntry>): BagReturnEntry {
  return {
    "1M": 5.06,
    "1Y": null,
    ALL: 10.99,
    since: "2025-12-24T00:00:00.000Z",
    sparkline: [],
    ...overrides,
  };
}

describe("pickCardReturns", () => {
  test("1M primary with 1Y secondary when history spans a year", () => {
    expect(
      pickCardReturns(
        entry({ "1Y": 22.4, since: "2025-08-01T00:00:00.000Z" }),
        NOW,
      ),
    ).toEqual({
      primary: { label: "1M", pct: 5.06 },
      secondary: { label: "1Y", pct: 22.4 },
    });
  });

  test("1Y reported for a 9-month-old bag reads as since", () => {
    expect(
      pickCardReturns(
        entry({ "1Y": 10.99, since: "2025-12-24T00:00:00.000Z" }),
        NOW,
      )?.secondary,
    ).toEqual({ label: "since Dec '25", pct: 10.99 });
  });

  test("1Y shown when since is 13 months ago", () => {
    expect(
      pickCardReturns(
        entry({ "1Y": 18.2, ALL: 20.1, since: "2025-08-25T00:00:00.000Z" }),
        NOW,
      )?.secondary,
    ).toEqual({ label: "1Y", pct: 18.2 });
  });

  test("falls back to since-first-point when 1Y is null", () => {
    expect(pickCardReturns(entry({}), NOW)).toEqual({
      primary: { label: "1M", pct: 5.06 },
      secondary: { label: "since Dec '25", pct: 10.99 },
    });
  });

  test("recent history reads as since listing", () => {
    const picked = pickCardReturns(
      entry({ since: "2026-09-06T00:00:00.000Z" }),
      NOW,
    );
    expect(picked?.secondary).toEqual({ label: "since listing", pct: 10.99 });
  });

  test("promotes the all-time figure when 1M is null", () => {
    expect(
      pickCardReturns(
        entry({ "1M": null, ALL: -3.2, since: "2026-09-06T00:00:00.000Z" }),
        NOW,
      ),
    ).toEqual({ primary: { label: "since listing", pct: -3.2 } });
  });

  test("null when there is no history at all", () => {
    expect(
      pickCardReturns(entry({ "1M": null, ALL: null, since: null }), NOW),
    ).toBeNull();
    expect(pickCardReturns(undefined, NOW)).toBeNull();
  });
});

describe("sinceLabel", () => {
  test("uses the UTC month so midnight-UTC dates don't slip a month", () => {
    expect(sinceLabel("2026-01-01T00:00:00.000Z", NOW)).toBe("since Jan '26");
  });
});
