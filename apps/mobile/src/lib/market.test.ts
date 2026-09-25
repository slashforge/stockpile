import { describe, expect, test } from "bun:test";
import {
  changeTone,
  EM_DASH,
  evidenceLine,
  formatAsOf,
  formatImpactPct,
  formatPrice,
  formatSignedPct,
  formatUsdCompact,
  underlyingCaption,
} from "./market";

describe("formatImpactPct", () => {
  test("one decimal, unsigned, floor for tiny impact", () => {
    expect(formatImpactPct(2.2349)).toBe("2.2%");
    expect(formatImpactPct(-1.93)).toBe("1.9%");
    expect(formatImpactPct(0.01)).toBe("<0.1%");
    expect(formatImpactPct(null)).toBe(EM_DASH);
    expect(formatImpactPct(Number.NaN)).toBe(EM_DASH);
  });
});

describe("formatSignedPct / changeTone", () => {
  test("signs and rounds", () => {
    expect(formatSignedPct(1.84)).toBe("+1.8%");
    expect(formatSignedPct(-0.44)).toBe("-0.4%");
    expect(formatSignedPct(0.01)).toBe("0.0%");
    expect(formatSignedPct(-0.04)).toBe("0.0%");
  });

  test("unknown values are an em dash, never zero", () => {
    expect(formatSignedPct(null)).toBe(EM_DASH);
    expect(formatSignedPct(Number.NaN)).toBe(EM_DASH);
    expect(changeTone(null)).toBeNull();
  });

  test("tone thresholds", () => {
    expect(changeTone(1.2)).toBe("up");
    expect(changeTone(-3)).toBe("down");
    expect(changeTone(0.02)).toBe("flat");
  });
});

describe("formatUsdCompact / formatPrice", () => {
  test("compacts liquidity", () => {
    expect(formatUsdCompact(3200)).toBe("$3.2k");
    expect(formatUsdCompact(1_250_000)).toBe("$1.3M");
    expect(formatUsdCompact(840)).toBe("$840");
    expect(formatUsdCompact(null)).toBe(EM_DASH);
  });

  test("prices", () => {
    expect(formatPrice(182.456)).toBe("$182.46");
    expect(formatPrice(0.51234)).toBe("$0.5123");
    expect(formatPrice(0)).toBe(EM_DASH);
  });
});

describe("formatAsOf", () => {
  const now = new Date("2026-09-25T18:00:00Z");
  test("handles missing and invalid timestamps", () => {
    expect(formatAsOf(null, now)).toBeNull();
    expect(formatAsOf("nope", now)).toBeNull();
  });
  test("includes the date when not today", () => {
    expect(formatAsOf("2026-08-12T15:42:00Z", now)).toMatch(/^as of Aug 12, /);
  });
});

describe("evidenceLine", () => {
  test("joins available parts", () => {
    expect(
      evidenceLine({
        kind: "disclosure",
        member: "Pelosi",
        chamber: "House",
        txnType: "buy",
        txnDate: "2026-07-30",
        disclosedDate: "2026-08-12",
        amountRange: "$1M–5M",
        amountMidUsd: 3_000_000,
        url: "https://example.com/filing",
      }),
    ).toBe("Pelosi · Purchase · $1M–5M · disclosed Aug 12");
    expect(
      evidenceLine({
        kind: "disclosure",
        member: "Pelosi",
        chamber: "Senate",
        txnType: "sell",
        txnDate: "",
        disclosedDate: "",
        amountRange: "",
        amountMidUsd: 0,
        url: "",
      }),
    ).toBe("Pelosi · Sale");
  });
});

describe("underlyingCaption", () => {
  const now = new Date("2026-09-25T18:00:00Z");
  test("labels each reference source", () => {
    expect(
      underlyingCaption(
        { source: "pyth", price: 1, asOf: "2026-08-12T15:42:00Z" },
        now,
      ),
    ).toMatch(/^Stock price as of Aug 12/);
    expect(
      underlyingCaption(
        { source: "jupiter-stock", price: 1, asOf: "2026-08-12T15:42:00Z" },
        now,
      ),
    ).toMatch(/^Stock reference \(Jupiter\) as of/);
    expect(
      underlyingCaption(
        { source: "prestocks", price: 1, asOf: "2026-08-12T15:42:00Z" },
        now,
      ),
    ).toMatch(/^Issuer mark as of/);
  });
  test("hides when missing", () => {
    expect(underlyingCaption(null, now)).toBeNull();
    expect(
      underlyingCaption({ source: "pyth", price: 1, asOf: "bad" }, now),
    ).toBeNull();
  });
});
