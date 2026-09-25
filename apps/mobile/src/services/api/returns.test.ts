/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { parseBagReturns } from "./returns";

describe("bag returns parsing", () => {
  test("maps windows, drops non-finite values and flattens the 1M sparkline", () => {
    const parsed = parseBagReturns({
      source: "tokens.xyz",
      interval: "1D",
      asOf: "2026-09-25T00:00:00.000Z",
      reason: null,
      returns: {
        megacap: {
          "1M": 5.06,
          "1Y": null,
          ALL: 10.99,
          since: "2025-12-24T00:00:00.000Z",
          sparkline1M: [
            { t: 1_788_000_000, value: 101 },
            { t: 1_787_900_000, value: 100 },
            { t: 1_788_100_000, value: Number.NaN },
          ],
        },
        broken: {
          "1M": Number.NaN,
          "1Y": null,
          ALL: null,
          since: "not a date",
          sparkline1M: [],
        },
      },
    });
    expect(parsed.megacap).toEqual({
      "1M": 5.06,
      "1Y": null,
      ALL: 10.99,
      since: "2025-12-24T00:00:00.000Z",
      sparkline: [100, 101],
    });
    expect(parsed.broken).toEqual({
      "1M": null,
      "1Y": null,
      ALL: null,
      since: null,
      sparkline: [],
    });
  });
});
