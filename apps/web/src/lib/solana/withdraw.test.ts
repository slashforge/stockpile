/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { Buffer } from "buffer";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { USDC_MINT } from "./transaction";
import { parseAmount, SOL_ASSET, withdrawalProblems, type WithdrawAsset } from "./withdraw";

const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const payer = Keypair.generate();
const wallet = Keypair.generate().publicKey;
const recipient = Keypair.generate().publicKey;
const mint = new PublicKey(USDC_MINT);
const ataOf = (owner: PublicKey) => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ATA)[0];

function transferChecked(destination: PublicKey, amount: bigint) {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(amount, 1);
  data.writeUInt8(6, 9);
  return new TransactionInstruction({
    programId: TOKEN,
    keys: [
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
    ],
    data,
  });
}

function createAta(owner: PublicKey) {
  return new TransactionInstruction({
    programId: ATA,
    keys: [
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: ataOf(owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function sponsored(instructions: TransactionInstruction[]) {
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: SystemProgram.programId.toBase58(),
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }), ...instructions],
    }).compileToV0Message(),
  );
  tx.sign([payer]);
  return Buffer.from(tx.serialize()).toString("base64");
}

const usdc = { walletAddress: wallet.toBase58(), destination: recipient.toBase58(), asset: USDC_MINT, amount: 10_000_000n };

describe("withdrawalProblems", () => {
  test("accepts the exact token transfer, with or without opening the recipient account", () => {
    expect(withdrawalProblems(sponsored([transferChecked(ataOf(recipient), 10_000_000n)]), usdc)).toEqual([]);
    expect(withdrawalProblems(sponsored([createAta(recipient), transferChecked(ataOf(recipient), 10_000_000n)]), usdc)).toEqual([]);
  });

  test("blocks a different recipient, amount or extra instruction", () => {
    const attacker = Keypair.generate().publicKey;
    expect(withdrawalProblems(sponsored([transferChecked(ataOf(attacker), 10_000_000n)]), usdc)).not.toEqual([]);
    expect(withdrawalProblems(sponsored([transferChecked(ataOf(recipient), 10_000_001n)]), usdc)).not.toEqual([]);
    expect(
      withdrawalProblems(
        sponsored([transferChecked(ataOf(recipient), 10_000_000n), SystemProgram.transfer({ fromPubkey: wallet, toPubkey: attacker, lamports: 1 })]),
        usdc,
      ),
    ).toContain("The transaction does something other than this transfer.");
    expect(withdrawalProblems(sponsored([createAta(attacker), transferChecked(ataOf(recipient), 10_000_000n)]), usdc)).not.toEqual([]);
  });

  test("checks SOL transfers by lamports and recipient", () => {
    const sol = { ...usdc, asset: SOL_ASSET, amount: 5_000_000n };
    expect(withdrawalProblems(sponsored([SystemProgram.transfer({ fromPubkey: wallet, toPubkey: recipient, lamports: 5_000_000 })]), sol)).toEqual([]);
    expect(withdrawalProblems(sponsored([SystemProgram.transfer({ fromPubkey: wallet, toPubkey: recipient, lamports: 5_000_001 })]), sol)).not.toEqual([]);
  });
});

describe("parseAmount", () => {
  const asset: WithdrawAsset = { asset: "m", mint: "m", symbol: "AAPLx", name: "", iconUrl: null, raw: 0n, decimals: 8, multiplier: 1.25, usdPrice: null };
  test("converts a displayed amount back to raw units, unscaling UI-amount tokens", () => {
    expect(parseAmount({ ...asset, multiplier: 1, decimals: 6 }, "1.5")).toBe(1_500_000n);
    expect(parseAmount(asset, "1.25")).toBe(100_000_000n);
    expect(parseAmount(asset, "0")).toBeNull();
    expect(parseAmount({ ...asset, multiplier: 1, decimals: 6 }, "1.0000001")).toBeNull();
  });
});
