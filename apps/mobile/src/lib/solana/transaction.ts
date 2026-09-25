import { Buffer } from "buffer";
import { ed25519 } from "@noble/curves/ed25519.js";
import { VersionedTransaction } from "@solana/web3.js";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

const PACKET_DATA_SIZE = 1232;

const KNOWN_PROGRAMS: Record<string, string> = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter Aggregator v6",
  ComputeBudget111111111111111111111111111111: "Compute Budget",
  "11111111111111111111111111111111": "System Program",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "SPL Token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token Account",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
};

export type TransactionSummary = {
  version: VersionedTransaction["version"];
  feePayer: string;
  /** True when someone other than the user (the Stockpile paymaster) pays the network fee. */
  sponsored: boolean;
  requiredSigners: string[];
  instructionCount: number;
  programs: { id: string; label: string | null }[];
  addressLookupTables: number;
  sizeBytes: number;
  /** Problems that must block signing. */
  errors: string[];
  /** Things the user should notice but that do not block signing. */
  warnings: string[];
};

export function decodeTransaction(base64: string): VersionedTransaction {
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.toString("base64") !== base64.replace(/\s/g, "")) {
    throw new Error("Transaction is not valid base64");
  }
  return VersionedTransaction.deserialize(bytes);
}

/**
 * Decodes an unsigned transaction returned by the API and checks it can only be
 * signed by the user's own wallet before anything is shown to the signer. The only other
 * signer allowed is a fee payer (Stockpile's paymaster) that has already validly signed.
 */
export function inspectTransaction(base64: string, walletAddress: string | null): TransactionSummary {
  const tx = decodeTransaction(base64);
  const message = tx.message;
  const keys = message.staticAccountKeys.map((key) => key.toBase58());
  const signerCount = message.header.numRequiredSignatures;
  const requiredSigners = keys.slice(0, signerCount);
  const programIds = Array.from(
    new Set(message.compiledInstructions.map((ix) => keys[ix.programIdIndex]).filter(Boolean)),
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  const sizeBytes = tx.serialize().length;
  const feePayer = requiredSigners[0] ?? "";
  const sponsored = !!walletAddress && feePayer !== walletAddress;

  if (!walletAddress) {
    errors.push("No wallet is connected.");
  } else if (!requiredSigners.includes(walletAddress)) {
    errors.push("Your wallet is not a signer on this transaction.");
  }
  if (sponsored && !signatureValid(tx, 0)) {
    errors.push("The network fee sponsor hasn't signed this transaction.");
  }
  const otherSigners = requiredSigners.filter((key) => key !== walletAddress && !(sponsored && key === feePayer));
  if (otherSigners.length > 0) {
    errors.push(`Transaction requires ${otherSigners.length} additional signer(s).`);
  }
  if (tx.version !== "legacy" && tx.version !== 0) {
    errors.push("Unsupported transaction version for the embedded wallet.");
  }
  if (sizeBytes > PACKET_DATA_SIZE) {
    errors.push("Transaction is larger than the Solana packet limit.");
  }
  const unknown = programIds.filter((id) => !KNOWN_PROGRAMS[id]);
  if (unknown.length > 0) {
    warnings.push(
      `Calls ${unknown.length} program(s) Stockpile does not recognise (typically Jupiter route venues).`,
    );
  }
  if (!programIds.includes("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")) {
    warnings.push("Transaction does not route through Jupiter v6.");
  }

  return {
    version: tx.version,
    feePayer,
    sponsored,
    requiredSigners,
    instructionCount: message.compiledInstructions.length,
    programs: programIds.map((id) => ({ id, label: KNOWN_PROGRAMS[id] ?? null })),
    addressLookupTables: message.addressTableLookups.length,
    sizeBytes,
    errors,
    warnings,
  };
}

function signatureValid(tx: VersionedTransaction, index: number): boolean {
  const signature = tx.signatures[index];
  const key = tx.message.staticAccountKeys[index];
  if (!signature || !key || signature.every((byte) => byte === 0)) return false;
  try {
    return ed25519.verify(signature, tx.message.serialize(), key.toBytes());
  } catch {
    return false;
  }
}

/**
 * Checks what the wallet handed back before it is broadcast: the exact message that was inspected,
 * every signature that was already there (the fee sponsor's) untouched, and a valid wallet signature.
 */
export function assertWalletSigned(original: VersionedTransaction, signed: VersionedTransaction, walletAddress: string) {
  const before = original.message.serialize();
  const after = signed.message.serialize();
  if (before.length !== after.length || before.some((byte, i) => byte !== after[i])) {
    throw new Error("The wallet changed the transaction while signing.");
  }
  original.signatures.forEach((signature, index) => {
    const existing = signature.some((byte) => byte !== 0);
    if (existing && signature.some((byte, i) => byte !== signed.signatures[index]?.[i])) {
      throw new Error("The wallet changed the fee sponsor's signature.");
    }
  });
  const walletIndex = signed.message.staticAccountKeys.findIndex((key) => key.toBase58() === walletAddress);
  if (walletIndex < 0 || walletIndex >= signed.message.header.numRequiredSignatures || !signatureValid(signed, walletIndex)) {
    throw new Error("The wallet didn't sign this transaction.");
  }
}

export function explorerTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

export function explorerAccountUrl(address: string) {
  return `https://solscan.io/account/${address}`;
}
