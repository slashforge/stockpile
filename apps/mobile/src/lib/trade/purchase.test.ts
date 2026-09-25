/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  failedLegIndices,
  sellConfirmMessage,
  legDisplayStatus,
  legsToSign,
  purchaseConfirmMessage,
  purchaseStatus,
  serialize,
} from "./purchase";
import type { LegSigningState } from "./signing";

const mints = ["A", "B", "C"];
const none = new Set<string>();

describe("legsToSign", () => {
  test("signs every fresh leg", () => {
    expect(legsToSign(mints, {}, none)).toEqual([0, 1, 2]);
  });
  test("skips broadcast legs and assets bought in an earlier set", () => {
    const states: Record<number, LegSigningState> = {
      0: { status: "failed", error: "x", signature: "s" },
      2: { status: "failed", error: "cancelled" },
    };
    expect(legsToSign(mints, states, new Set(["B"]))).toEqual([2]);
  });
});

describe("purchaseStatus", () => {
  test("idle before anything is sent", () => {
    expect(purchaseStatus(mints, {}, none)).toBe("idle");
    expect(purchaseStatus([], {}, none)).toBe("idle");
  });
  test("running while any leg signs, or submitted legs await confirmation", () => {
    expect(purchaseStatus(mints, { 0: { status: "signing" } }, none)).toBe("running");
    expect(purchaseStatus(mints, { 0: { status: "submitted", signature: "s" } }, none, true)).toBe(
      "running",
    );
  });
  test("complete when every leg confirmed or was bought earlier", () => {
    const states: Record<number, LegSigningState> = {
      0: { status: "confirmed", signature: "a" },
      2: { status: "confirmed", signature: "c" },
    };
    expect(purchaseStatus(mints, states, new Set(["B"]))).toBe("complete");
  });
  test("partial when a leg failed or confirmation is unknown after the run", () => {
    expect(
      purchaseStatus(
        mints,
        {
          0: { status: "confirmed", signature: "a" },
          1: { status: "failed", error: "x" },
          2: { status: "confirmed", signature: "c" },
        },
        none,
      ),
    ).toBe("partial");
    expect(
      purchaseStatus(
        mints,
        {
          0: { status: "confirmed", signature: "a" },
          1: { status: "submitted", signature: "b" },
          2: { status: "confirmed", signature: "c" },
        },
        none,
        false,
      ),
    ).toBe("partial");
  });
});

describe("legDisplayStatus", () => {
  test("maps signing states and earlier purchases", () => {
    expect(legDisplayStatus(undefined, false)).toBe("queued");
    expect(legDisplayStatus({ status: "idle" }, true)).toBe("earlier");
    expect(legDisplayStatus({ status: "confirmed", signature: "s" }, true)).toBe("confirmed");
  });
});

describe("failedLegIndices", () => {
  test("lists failed legs only", () => {
    expect(
      failedLegIndices({ 0: { status: "confirmed", signature: "a" }, 2: { status: "failed", error: "x" } }, 3),
    ).toEqual([2]);
  });
});

describe("purchaseConfirmMessage", () => {
  test("describes swaps, total, slippage and impact warnings", () => {
    const message = purchaseConfirmMessage({
      swaps: 3,
      totalUsdc: "10",
      slippageBps: 100,
      risky: [{ symbol: "XYZ", impactPct: 6.5 }],
    });
    expect(message).toContain("3 swaps for 10 USDC");
    expect(message).toContain("1%");
    expect(message).toContain("XYZ: 6.50%");
    expect(message).toContain("can’t be undone");
  });
});

describe("serialize", () => {
  test("runs calls one at a time in order, even after a failure", async () => {
    const log: string[] = [];
    let active = 0;
    const run = serialize(async (id: string) => {
      active += 1;
      expect(active).toBe(1);
      log.push(`start ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      log.push(`end ${id}`);
      active -= 1;
      if (id === "b") throw new Error("boom");
      return id;
    });
    const results = await Promise.allSettled([run("a"), run("b"), run("c")]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });
});

describe("sellConfirmMessage", () => {
  test("says the tokens become USDC and it can't be undone", () => {
    const message = sellConfirmMessage({ swaps: 3, portionPct: 50, totalUsdc: "12.34", slippageBps: 100, risky: [] });
    expect(message).toContain("swap them to USDC");
    expect(message).toContain("50%");
    expect(message).toContain("12.34 USDC");
    expect(message).toContain("can’t be undone");
  });
});
