/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { Buffer } from "buffer";
import {
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { inspectTransaction } from "./transaction";

const BLOCKHASH = "11111111111111111111111111111111";

function unsignedTx(payer: Keypair, extraSigner?: Keypair) {
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
  ];
  if (extraSigner) {
    instructions.push(
      SystemProgram.transfer({ fromPubkey: extraSigner.publicKey, toPubkey: payer.publicKey, lamports: 1 }),
    );
  }
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions,
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

describe("inspectTransaction", () => {
  test("accepts a tx where the user's wallet is the only signer and fee payer", () => {
    const wallet = Keypair.generate();
    const summary = inspectTransaction(unsignedTx(wallet), wallet.publicKey.toBase58());
    expect(summary.errors).toEqual([]);
    expect(summary.feePayer).toBe(wallet.publicKey.toBase58());
    expect(summary.version).toBe(0);
    expect(summary.instructionCount).toBe(2);
    expect(summary.programs.map((p) => p.label)).toContain("Compute Budget");
    expect(summary.warnings).toContain("Transaction does not route through Jupiter v6.");
  });

  test("blocks a tx built for another wallet", () => {
    const summary = inspectTransaction(unsignedTx(Keypair.generate()), Keypair.generate().publicKey.toBase58());
    expect(summary.errors).toContain("Fee payer is not your wallet.");
  });

  test("blocks a tx needing extra signers", () => {
    const wallet = Keypair.generate();
    const summary = inspectTransaction(unsignedTx(wallet, Keypair.generate()), wallet.publicKey.toBase58());
    expect(summary.errors.some((e) => e.includes("additional signer"))).toBe(true);
  });

  test("blocks when no wallet is connected", () => {
    const summary = inspectTransaction(unsignedTx(Keypair.generate()), null);
    expect(summary.errors).toContain("No wallet is connected.");
  });

  test("rejects non-base64 input", () => {
    expect(() => inspectTransaction("not base64!", null)).toThrow();
  });
});
