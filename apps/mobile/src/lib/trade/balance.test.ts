/// <reference types="bun" />
import { expect, test } from "bun:test";
import type { Portfolio } from "@/services/api/types";
import { exceedsBalance, solBalance, spendableUsdc } from "./balance";

const live = (usdc: Portfolio["usdc"], sol: Portfolio["sol"] = { amount: "10000000", decimals: 9 }): Portfolio => ({
  walletAddress: "w",
  status: "live",
  holdings: [],
  sol,
  usdc,
  asOf: null,
  message: null,
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
