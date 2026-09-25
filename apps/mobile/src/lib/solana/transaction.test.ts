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
    expect(summary.errors).toContain("Your wallet is not a signer on this transaction.");
  });

  test("accepts a sponsored tx only when the fee payer has validly signed", () => {
    const wallet = Keypair.generate();
    const sponsor = Keypair.generate();
    const message = new TransactionMessage({
      payerKey: sponsor.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 })],
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);
    const encode = (value: VersionedTransaction) => Buffer.from(value.serialize()).toString("base64");
    const address = wallet.publicKey.toBase58();

    const unsigned = inspectTransaction(encode(tx), address);
    expect(unsigned.sponsored).toBe(true);
    expect(unsigned.errors).toEqual(["The network fee sponsor hasn't signed this transaction."]);

    tx.sign([sponsor]);
    const signed = inspectTransaction(encode(tx), address);
    expect(signed.errors).toEqual([]);
    expect(signed.feePayer).toBe(sponsor.publicKey.toBase58());
    expect(signed.requiredSigners).toEqual([sponsor.publicKey.toBase58(), address]);

    tx.signatures[0] = new Uint8Array(64).fill(1);
    expect(inspectTransaction(encode(tx), address).errors).toContain("The network fee sponsor hasn't signed this transaction.");
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
