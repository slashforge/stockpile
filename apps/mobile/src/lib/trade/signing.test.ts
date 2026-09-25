/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { Buffer } from "buffer";
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  canSignLeg,
  isPreparedExpired,
  type LegSigningState,
  PREPARED_TTL_MS,
  signLeg,
  tradeProgress,
} from "./signing";

const wallet = Keypair.generate();
const walletAddress = wallet.publicKey.toBase58();

function unsignedTx(payer = wallet) {
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
    ],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

function harness(opts: {
  sign?: (base64: string) => Promise<{ signature: string }>;
  confirm?: "confirmed" | "failed" | "unknown";
}) {
  const states: LegSigningState[] = [];
  const signed: string[] = [];
  const deps = {
    signAndSend: async (base64: string) => {
      signed.push(base64);
      return opts.sign ? opts.sign(base64) : { signature: "sig-1" };
    },
    waitForConfirmation: async () => ({ status: opts.confirm ?? "confirmed" }) as const,
    onState: (state: LegSigningState) => states.push(state),
  };
  return { states, signed, deps };
}

describe("signLeg", () => {
  test("signs, submits and confirms a safe transaction", async () => {
    const h = harness({});
    const result = await signLeg(unsignedTx(), walletAddress, h.deps);
    expect(result).toEqual({ status: "confirmed", signature: "sig-1" });
    expect(h.states.map((s) => s.status)).toEqual(["signing", "submitted", "confirmed"]);
    expect(h.signed).toHaveLength(1);
  });

  test("never calls the wallet for a transaction built for someone else", async () => {
    const h = harness({});
    const result = await signLeg(unsignedTx(Keypair.generate()), walletAddress, h.deps);
    expect(result.status).toBe("failed");
    expect(h.signed).toHaveLength(0);
    expect(canSignLeg(result)).toBe(true);
  });

  test("never calls the wallet for undecodable data", async () => {
    const h = harness({});
    const result = await signLeg("garbage!!", walletAddress, h.deps);
    expect(result.status).toBe("failed");
    expect(h.signed).toHaveLength(0);
  });

  test("fails without a wallet and does not sign", async () => {
    const h = harness({});
    const result = await signLeg(unsignedTx(), null, h.deps);
    expect(result.status).toBe("failed");
    expect(h.signed).toHaveLength(0);
    const noSigner = await signLeg(unsignedTx(), walletAddress, { ...h.deps, signAndSend: null });
    expect(noSigner.status).toBe("failed");
  });

  test("user rejection leaves the leg retryable and nothing broadcast", async () => {
    const h = harness({
      sign: async () => {
        throw new Error("User rejected the request");
      },
    });
    const result = await signLeg(unsignedTx(), walletAddress, h.deps);
    expect(result).toEqual({ status: "failed", error: "Signing was cancelled." });
    expect(canSignLeg(result)).toBe(true);
  });

  test("on-chain failure keeps the signature and is not retryable", async () => {
    const h = harness({ confirm: "failed" });
    const result = await signLeg(unsignedTx(), walletAddress, h.deps);
    expect(result.status).toBe("failed");
    expect(result).toMatchObject({ signature: "sig-1" });
    expect(canSignLeg(result)).toBe(false);
  });

  test("unknown confirmation stays submitted and is not retryable", async () => {
    const h = harness({ confirm: "unknown" });
    const result = await signLeg(unsignedTx(), walletAddress, h.deps);
    expect(result).toEqual({ status: "submitted", signature: "sig-1" });
    expect(canSignLeg(result)).toBe(false);
  });
});

describe("partial completion", () => {
  test("tracks progress without claiming completion", () => {
    const states: Record<number, LegSigningState> = {
      0: { status: "confirmed", signature: "a" },
      1: { status: "failed", error: "rejected" },
    };
    expect(tradeProgress(3, states)).toEqual({
      started: true,
      anySent: true,
      confirmedCount: 1,
      allConfirmed: false,
    });
    expect(canSignLeg(states[0])).toBe(false);
    expect(canSignLeg(states[1])).toBe(true);
    expect(canSignLeg(undefined)).toBe(true);
    expect(canSignLeg({ status: "signing" })).toBe(false);
  });

  test("all confirmed only when every transaction confirmed", () => {
    const done: Record<number, LegSigningState> = {
      0: { status: "confirmed", signature: "a" },
      1: { status: "confirmed", signature: "b" },
    };
    expect(tradeProgress(2, done).allConfirmed).toBe(true);
    expect(tradeProgress(0, {}).allConfirmed).toBe(false);
    expect(tradeProgress(2, {})).toMatchObject({ started: false, anySent: false });
  });

  test("prepared transactions expire", () => {
    expect(isPreparedExpired(null, Date.now())).toBe(false);
    expect(isPreparedExpired(1_000, 1_000 + PREPARED_TTL_MS)).toBe(false);
    expect(isPreparedExpired(1_000, 1_001 + PREPARED_TTL_MS)).toBe(true);
  });
});
