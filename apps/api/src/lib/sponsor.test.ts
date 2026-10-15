import { expect, it } from "bun:test";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { inspectSponsoredSwap, sponsorSwapTransaction } from "./sponsor";

const ATA = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const JUP = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

function fixture() {
  const payer = Keypair.generate(), wallet = Keypair.generate();
  const swap = new TransactionInstruction({ programId: JUP, keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: false }], data: Buffer.from([1]) });
  const tx = (extra: TransactionInstruction[] = [], legacy = false) => {
    const message = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: SystemProgram.programId.toBase58(), instructions: [...extra, swap] });
    return new VersionedTransaction(legacy ? message.compileToLegacyMessage() : message.compileToV0Message());
  };
  const ata = () => new TransactionInstruction({ programId: ATA, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true }], data: Buffer.from([1]) });
  return { payer, wallet, tx, ata };
}

it("pre-signs legacy and v0 orders without changing their message", () => {
  const { payer, wallet, tx } = fixture();
  for (const legacy of [false, true]) {
    const original = tx([], legacy);
    const signed = VersionedTransaction.deserialize(Buffer.from(sponsorSwapTransaction(Buffer.from(original.serialize()).toString("base64"), payer, wallet.publicKey.toBase58()), "base64"));
    expect(signed.message.serialize()).toEqual(original.message.serialize());
    expect(signed.signatures[0]!.some(Boolean)).toBe(true);
    expect(signed.signatures[1]!.every((byte) => byte === 0)).toBe(true);
  }
});

it("allows up to three ATA creations and wallet rent refunds, rejects paymaster transfers and excessive budgets", () => {
  const { payer, wallet, tx, ata } = fixture();
  const inspect = (transaction: VersionedTransaction) => inspectSponsoredSwap(transaction, payer.publicKey, wallet.publicKey);
  expect(() => inspect(tx([ata(), ata(), ata(), SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: payer.publicKey, lamports: 1 })]))).not.toThrow();
  expect(() => inspect(tx([ata(), ata(), ata(), ata()]))).toThrow("too many token accounts");
  expect(() => inspect(tx([SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: wallet.publicKey, lamports: 1 })]))).toThrow("more than fees and rent");
  expect(() => inspect(tx([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_001 })]))).toThrow("too many compute units");
  expect(() => inspect(tx([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_001 })]))).toThrow("priority fee");
});
