import { expect, it } from "bun:test";
import { base58, inspectTransaction } from "./solana-tx";
import { base58Decode, fakeTransaction } from "./solana-tx.fixture";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

it("round-trips base58 public keys", () => {
  expect(base58(base58Decode(USDC))).toBe(USDC);
  expect(base58(new Uint8Array(32))).toBe("11111111111111111111111111111111");
  expect(base58Decode(USDC)).toHaveLength(32);
});

it("reports fee payer, version and unsigned state for legacy and v0 transactions", () => {
  expect(inspectTransaction(fakeTransaction(USDC))).toMatchObject({ version: "legacy", feePayer: USDC, signatureCount: 1, signed: false, staticAccountCount: 2 });
  expect(inspectTransaction(fakeTransaction(USDC, { version: 0 }))).toMatchObject({ version: 0, feePayer: USDC, signed: false });
  expect(inspectTransaction(fakeTransaction(USDC, { version: 0, signed: true })).signed).toBe(true);
  expect(inspectTransaction(fakeTransaction(USDC, { version: 0, signatures: 2 })).signatureCount).toBe(2);
});

it("rejects malformed payloads instead of guessing", () => {
  expect(() => inspectTransaction("AQIDBA==")).toThrow();
  expect(() => inspectTransaction(Buffer.from([1, ...new Array(64).fill(0), 0x80, 2, 0, 1, 1, ...new Array(32).fill(1)]).toString("base64"))).toThrow(/signature count/);
});
