/// <reference types="bun" />
import { expect, test } from "bun:test";
import type { Portfolio } from "@/services/api/types";
import { belowOneUnit, defaultBuyAmount, exceedsBalance, solBalance, spendableUsdc } from "./balance";

type RawBalance = { amount: string; decimals: number };

const bal = (raw: RawBalance | null): Portfolio["usdc"] =>
  raw ? { ...raw, uiAmount: "0", usdPrice: null, usdValue: null } : null;

const live = (usdc: RawBalance | null, sol: RawBalance = { amount: "10000000", decimals: 9 }): Portfolio => ({
  walletAddress: "w",
  status: "live",
  holdings: [],
  sol: bal(sol),
  usdc: bal(usdc),
  asOf: null,
  message: null,
  totalUsd: null,
  unpricedCount: 0,
});

test("unknown until the portfolio loads or when it is unavailable", () => {
  expect(spendableUsdc(undefined).status).toBe("unknown");
  expect(
    spendableUsdc({
      walletAddress: null,
      status: "unavailable",
      holdings: [],
      sol: null,
      usdc: null,
      asOf: null,
      message: "No provider",
      totalUsd: null,
      unpricedCount: 0,
    }),
  ).toEqual({ status: "unknown", reason: "No provider" });
});

test("reads the server's USDC total exactly", () => {
  const balance = spendableUsdc(live({ amount: "25000000", decimals: 6 }));
  expect(balance).toEqual({ status: "known", raw: 25000000n, decimals: 6 });
  expect(exceedsBalance("25000000", balance)).toBe(false);
  expect(exceedsBalance("25000001", balance)).toBe(true);
});

test("zero USDC is known zero", () => {
  expect(spendableUsdc(live({ amount: "0", decimals: 6 }))).toEqual({ status: "known", raw: 0n, decimals: 6 });
});

test("null or malformed balances are unknown and never block", () => {
  expect(spendableUsdc(live(null)).status).toBe("unknown");
  const odd = spendableUsdc(live({ amount: "1", decimals: 9 }));
  expect(odd.status).toBe("unknown");
  expect(exceedsBalance("999999999", odd)).toBe(false);
});

test("SOL balance in lamports", () => {
  expect(solBalance(live({ amount: "0", decimals: 6 }))).toEqual({ status: "known", raw: 10000000n, decimals: 9 });
});

test("default buy amount is min($25, whole balance), $0 under $1", () => {
  const known = (raw: bigint) => ({ status: "known" as const, raw, decimals: 6 });
  expect(defaultBuyAmount(known(100_000_000n))).toBe("25");
  expect(defaultBuyAmount(known(7_990_000n))).toBe("7");
  expect(defaultBuyAmount(known(990_000n))).toBe("");
  expect(defaultBuyAmount(known(0n))).toBe("");
  expect(defaultBuyAmount({ status: "unknown", reason: "x" })).toBe("25");
  expect(belowOneUnit(known(999_999n))).toBe(true);
  expect(belowOneUnit(known(1_000_000n))).toBe(false);
});
