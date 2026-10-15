/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  applyCarriedConfirmation,
  type CarriedLegs,
  carriedBlocks,
  carryLegs,
  type LegSigningState,
  legHeights,
  NO_CARRIED,
  pollUntilSettled,
  PREPARED_TTL_MS,
  secondsUntilExpiry,
} from "./signing";

const mints = ["A", "B", "C", "D"];

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
    3: { status: "failed", error: "cancelled" },
  };

  test("carries signatures and confirmation state per mint; failures are rebuilt", () => {
    expect(carryLegs(NO_CARRIED, mints, states)).toEqual({
      A: { status: "confirmed", signature: "s0", lastValidBlockHeight: null },
      C: { status: "submitted", signature: "s2", lastValidBlockHeight: null },
    });
  });

  test("keeps earlier carried legs and lets newer ones win", () => {
    const earlier: CarriedLegs = {
      Z: { status: "submitted", signature: "z" },
      B: { status: "failed", signature: "old", error: "x" },
    };
    const next = carryLegs(earlier, ["B"], { 0: { status: "submitted", signature: "b2" } });
    expect(next).toEqual({
      Z: { status: "submitted", signature: "z" },
      B: { status: "submitted", signature: "b2", lastValidBlockHeight: null },
    });
  });

  test("carries each leg's last valid block height so polling can detect expiry", () => {
    const prepared = {
      status: "ready",
      transactions: [{ lastValidBlockHeight: 100 }, { lastValidBlockHeight: 200 }, { lastValidBlockHeight: 300 }, { lastValidBlockHeight: null }],
    };
    expect(legHeights(prepared)).toEqual([100, 200, 300, null]);
    expect(legHeights({ status: "unavailable", transactions: [] })).toEqual([]);
    expect(legHeights(null)).toEqual([]);
    expect(carryLegs(NO_CARRIED, mints, states, legHeights(prepared)).C).toEqual({
      status: "submitted",
      signature: "s2",
      lastValidBlockHeight: 300,
    });
  });

  test("pending and confirmed legs block re-sending, failed ones don't", () => {
    expect(carriedBlocks({ status: "submitted", signature: "s" })).toBe(true);
    expect(carriedBlocks({ status: "confirmed", signature: "s" })).toBe(true);
    expect(carriedBlocks({ status: "failed", signature: "s", error: "x" })).toBe(false);
    expect(carriedBlocks(undefined)).toBe(false);
  });
});

describe("polling carried pending legs", () => {
  const pending: CarriedLegs = { C: { status: "submitted", signature: "s2", lastValidBlockHeight: 300 } };

  test("confirmation marks the leg done", () => {
    expect(applyCarriedConfirmation(pending, "C", "s2", { status: "confirmed" })).toEqual({
      C: { status: "confirmed", signature: "s2", lastValidBlockHeight: 300 },
    });
  });

  test("an on-chain failure makes the mint retryable instead of reporting success", () => {
    const next = applyCarriedConfirmation(pending, "C", "s2", { status: "failed", error: "0x1771" });
    expect(next.C?.status).toBe("failed");
    expect(carriedBlocks(next.C)).toBe(false);
  });

  test("an expired pending leg becomes failed, is dropped on the next carry and gets rebuilt", () => {
    const next = applyCarriedConfirmation(pending, "C", "s2", { status: "failed", error: "expired" });
    expect(next.C).toMatchObject({ status: "failed", signature: "s2", lastValidBlockHeight: 300 });
    expect(next.C?.status === "failed" && next.C.error).toContain("expired");
    expect(carriedBlocks(next.C)).toBe(false);
    expect(carryLegs(next, [], {})).toEqual({});
  });

  test("unknown or stale results change nothing", () => {
    expect(applyCarriedConfirmation(pending, "C", "s2", { status: "unknown" })).toBe(pending);
    expect(applyCarriedConfirmation(pending, "C", "other", { status: "confirmed" })).toBe(pending);
    expect(applyCarriedConfirmation(NO_CARRIED, "C", "s2", { status: "confirmed" })).toBe(NO_CARRIED);
  });

  test("re-polls while unknown, up to the attempt limit", async () => {
    const calls: string[] = [];
    const results = [{ status: "unknown" as const }, { status: "confirmed" as const }];
    const settled = await pollUntilSettled("s", async (signature) => {
      calls.push(signature);
      return results[calls.length - 1] ?? { status: "unknown" };
    });
    expect(settled).toEqual({ status: "confirmed" });
    expect(calls).toHaveLength(2);

    let count = 0;
    const gaveUp = await pollUntilSettled("s", async () => ((count += 1), { status: "unknown" }), 3);
    expect(gaveUp.status).toBe("unknown");
    expect(count).toBe(3);
  });
});
