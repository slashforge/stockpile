/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  boughtMints,
  type LegSigningState,
  nextLegToSign,
  PREPARED_TTL_MS,
  purchaseComplete,
  secondsUntilExpiry,
} from "./signing";

const mints = ["A", "B", "C"];

describe("prepared set lifetime", () => {
  test("counts down whole seconds and stops at zero", () => {
    expect(secondsUntilExpiry(null, 5)).toBeNull();
    expect(secondsUntilExpiry(1_000, 1_000)).toBe(PREPARED_TTL_MS / 1000);
    expect(secondsUntilExpiry(1_000, 1_000 + 30_500)).toBe(30);
    expect(secondsUntilExpiry(1_000, 1_000 + PREPARED_TTL_MS + 5_000)).toBe(0);
  });
});

describe("legs across rebuilds", () => {
  const states: Record<number, LegSigningState> = {
    0: { status: "confirmed", signature: "s0" },
    1: { status: "failed", error: "slippage", signature: "s1" },
    2: { status: "submitted", signature: "s2" },
  };

  test("only broadcast, non-failed legs count as bought", () => {
    expect(boughtMints(mints, states)).toEqual(["A", "C"]);
  });

  test("auto-advance skips already bought and already sent legs", () => {
    const fresh: Record<number, LegSigningState> = { 0: { status: "submitted", signature: "x" } };
    expect(nextLegToSign(mints, fresh, new Set(), 0)).toBe(1);
    expect(nextLegToSign(mints, fresh, new Set(["B"]), 0)).toBe(2);
    expect(nextLegToSign(mints, fresh, new Set(["B", "C"]), 0)).toBeNull();
  });

  test("a rebuilt set is complete once remaining legs confirm", () => {
    const bought = new Set(["A"]);
    expect(purchaseComplete(mints, {}, bought)).toBe(false);
    expect(
      purchaseComplete(
        mints,
        { 1: { status: "confirmed", signature: "b" }, 2: { status: "confirmed", signature: "c" } },
        bought,
      ),
    ).toBe(true);
    expect(purchaseComplete(mints, {}, new Set())).toBe(false);
  });
});
