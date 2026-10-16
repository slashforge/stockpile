/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  base58,
  canSignLeg,
  definiteRejection,
  isPreparedExpired,
  type LegSigningState,
  PREPARED_TTL_MS,
  signLeg,
  SubmissionError,
  tradeProgress,
  transactionSignature,
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

  test("lost submit response keeps the signature, polls it and is never re-sendable", async () => {
    const h = harness({
      sign: async () => {
        throw new SubmissionError("Can't reach Newsbid right now.", "sig-lost", false);
      },
      confirm: "confirmed",
    });
    const result = await signLeg(unsignedTx(), walletAddress, h.deps);
    expect(result).toEqual({ status: "confirmed", signature: "sig-lost" });
    expect(h.states.map((s) => s.status)).toEqual(["signing", "submitted", "confirmed"]);
  });

  test("unknown submit outcome whose status stays unknown remains pending, not failed", async () => {
    const h = harness({
      sign: async () => {
        throw new SubmissionError("Transaction provider is busy.", "sig-lost", false);
      },
      confirm: "unknown",
    });
    const result = await signLeg(unsignedTx(), walletAddress, h.deps);
    expect(result).toEqual({ status: "submitted", signature: "sig-lost" });
    expect(canSignLeg(result)).toBe(false);
  });

  test("definite rejection (preflight 400) fails without a signature so it can be rebuilt", async () => {
    const h = harness({
      sign: async () => {
        throw new SubmissionError("Transaction simulation failed", "sig-x", true);
      },
    });
    const result = await signLeg(unsignedTx(), walletAddress, h.deps);
    expect(result.status).toBe("failed");
    expect(result).not.toHaveProperty("signature");
    expect(canSignLeg(result)).toBe(true);
  });
});

describe("submission outcome", () => {
  test("only 4xx (except timeouts) are definite rejections", () => {
    expect(definiteRejection(400)).toBe(true);
    expect(definiteRejection(401)).toBe(true);
    expect(definiteRejection(429)).toBe(true);
    expect(definiteRejection(408)).toBe(false);
    expect(definiteRejection(0)).toBe(false);
    expect(definiteRejection(500)).toBe(false);
    expect(definiteRejection(503)).toBe(false);
  });

  test("derives the transaction id from the first signature", () => {
    const tx = VersionedTransaction.deserialize(Buffer.from(unsignedTx(), "base64"));
    expect(transactionSignature(tx)).toBeNull();
    tx.sign([wallet]);
    expect(transactionSignature(tx)).toBe(bs58.encode(tx.signatures[0]!));
  });

  test("base58 matches the reference encoder, including leading zeros", () => {
    for (const bytes of [new Uint8Array([0, 0, 1, 2, 255]), new Uint8Array(64).fill(7), new Uint8Array([0])]) {
      expect(base58(bytes)).toBe(bs58.encode(bytes));
    }
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
