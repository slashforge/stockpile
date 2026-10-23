import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { heliusRpc } from "./broadcast";
import { minimumSponsorBalance, paymaster, rpcUrl } from "./sponsor";

/**
 * Withdrawals: a plain SOL or token transfer from the user's wallet to any Solana wallet address. Newsbid's paymaster pays
 * the network fee only. Opening the recipient's token account (rent) is paid by the user's wallet: the recipient could
 * close that account and keep the rent, so the paymaster never funds it.
 */
export const SOL_ASSET = "SOL";
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
/** Rent-exempt minimum of a plain (0-byte) wallet account: a wallet may hold 0 or at least this much SOL. */
export const MIN_WALLET_LAMPORTS = 890_880n;
const SIMULATION_COMPUTE_UNITS = 200_000;
const PRIORITY_MICRO_LAMPORTS = 50_000;
const MAX_U64 = 2n ** 64n - 1n;

export const withdrawErrorCodes = [
  "NO_WALLET", "PROVIDER_NOT_CONFIGURED", "INVALID_DESTINATION", "INVALID_ASSET", "AMOUNT_TOO_SMALL", "INSUFFICIENT_FUNDS",
  "NEEDS_SOL", "UNSUPPORTED_TOKEN", "REJECTED", "PROVIDER_ERROR",
] as const;
export type WithdrawErrorCode = (typeof withdrawErrorCodes)[number];
export type WithdrawError = { code: WithdrawErrorCode; message: string };
/** `asset` is "SOL" or a token mint; `amount` is in base units (lamports for SOL). */
export type WithdrawRequest = { asset: string; amount: string; destination: string };
export type PreparedWithdrawal = { transaction: string; lastValidBlockHeight: number; feePayer: string; createsAccount: boolean; rentLamports: number };
type Result<T> = { ok: true; value: T } | { ok: false; error: WithdrawError };

const fail = (code: WithdrawErrorCode, message: string): Result<never> => ({ ok: false, error: { code, message } });
const NEW_ADDRESS_MINIMUM = "This address is new to Solana, so it has to receive at least 0.00089 SOL.";
const WALLET_MINIMUM = "Solana needs at least 0.00089 SOL left in a wallet. Send all of it, or leave a little more.";
const NEEDS_SOL = "The recipient doesn’t have an account for this token yet. Opening one costs about 0.002 SOL from your wallet, and it doesn’t have enough. Add a little SOL, or send to a wallet that already holds this token.";

class RpcFailure extends Error {}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const { result, error } = await heliusRpc<T>(url, method, params);
  if (error || result === undefined) throw new RpcFailure(error?.message ?? `${method} failed`);
  return result;
}

type ParsedAccount = { owner: string; lamports: number; executable: boolean; data: unknown } | null;
type MintExtension = { extension: string; state?: Record<string, unknown> };
type MintInfo = { decimals: number; extensions?: MintExtension[] };
type TokenAccountEntry = { pubkey: string; account: { data: { parsed?: { info?: { tokenAmount?: { amount?: string }; state?: string } } } } };
type Simulation = { err: unknown; logs?: string[] | null; unitsConsumed?: number; accounts?: ({ lamports: number } | null)[] | null };

const getAccount = (url: string, address: string) =>
  rpc<{ value: ParsedAccount }>(url, "getAccountInfo", [address, { encoding: "jsonParsed", commitment: "confirmed" }]).then((r) => r.value);
const getLamports = (url: string, address: string) =>
  rpc<{ value: number }>(url, "getBalance", [address, { commitment: "confirmed" }]).then((r) => r.value);

function publicKey(value: string): PublicKey | null {
  try {
    const key = new PublicKey(value);
    return key.toBase58() === value ? key : null;
  } catch {
    return null;
  }
}

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey, program: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), program.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];
}

/** Associated Token Account `CreateIdempotent`: opens `owner`'s account for `mint`, rent paid by `payer`. */
export function createAtaInstruction(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey, program: PublicKey) {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: program, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

/** SPL Token / Token-2022 `TransferChecked` (instruction 12). */
export function transferCheckedInstruction(program: PublicKey, source: PublicKey, mint: PublicKey, destination: PublicKey, owner: PublicKey, amount: bigint, decimals: number) {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(amount, 1);
  data.writeUInt8(decimals, 9);
  return new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

const isCustom = (error: unknown, code: number) => typeof error === "object" && error !== null && (error as { Custom?: unknown }).Custom === code;

function simulationProblem(simulation: Simulation, keys: PublicKey[], context: { wallet: PublicKey; destination: PublicKey; sol: boolean; ataInstruction: number }): Result<never> {
  const { err } = simulation;
  const logs = simulation.logs ?? [];
  console.warn("withdraw simulation failed", JSON.stringify(err), logs.slice(-5).join(" | "));
  if (err === "InsufficientFundsForFee") return fail("PROVIDER_ERROR", "Fee sponsor is low on SOL; try again later");
  const rent = typeof err === "object" && err !== null ? (err as { InsufficientFundsForRent?: { account_index?: number } }).InsufficientFundsForRent : undefined;
  if (rent) {
    const key = keys[rent.account_index ?? -1];
    if (key?.equals(context.destination)) return fail("AMOUNT_TOO_SMALL", NEW_ADDRESS_MINIMUM);
    if (key?.equals(context.wallet)) return context.sol ? fail("INSUFFICIENT_FUNDS", WALLET_MINIMUM) : fail("NEEDS_SOL", NEEDS_SOL);
  }
  const text = logs.join("\n");
  if (/paused/i.test(text)) return fail("REJECTED", "Its issuer has paused transfers of this token right now.");
  if (/frozen/i.test(text)) return fail("REJECTED", "This token account is frozen by the token’s issuer.");
  const failed = typeof err === "object" && err !== null ? (err as { InstructionError?: [number, unknown] }).InstructionError : undefined;
  if (failed && failed[0] === context.ataInstruction) return fail("NEEDS_SOL", NEEDS_SOL);
  if (failed && isCustom(failed[1], 1)) return fail("INSUFFICIENT_FUNDS", "Your wallet doesn’t hold enough for this transfer.");
  const line = logs.find((entry) => /error|failed|insufficient/i.test(entry));
  return fail("REJECTED", `The network rejected this transfer${line ? `: ${line.replace(/^Program log: /, "")}` : "."}`);
}

/**
 * Builds the withdrawal, simulates it against the live chain (so balance, rent and token-rule failures surface before
 * the user signs), then pre-signs it as fee payer. The wallet adds its signature; `/trade/submit` broadcasts it.
 */
export async function prepareWithdrawal(request: WithdrawRequest, walletAddress: string): Promise<Result<PreparedWithdrawal>> {
  const payer = paymaster();
  const url = rpcUrl();
  if (!payer || !url) return fail("PROVIDER_NOT_CONFIGURED", "Sponsored network fees are not configured on this server");
  const wallet = new PublicKey(walletAddress);
  const destination = publicKey(request.destination);
  if (!destination) return fail("INVALID_DESTINATION", "That isn’t a valid Solana address.");
  if (destination.equals(wallet)) return fail("INVALID_DESTINATION", "That’s your Newsbid wallet. Enter the address you want to send to.");
  if (destination.equals(payer.publicKey)) return fail("INVALID_DESTINATION", "That address can’t receive withdrawals.");
  if (!/^[1-9][0-9]*$/.test(request.amount)) return fail("AMOUNT_TOO_SMALL", "Enter an amount above zero.");
  const amount = BigInt(request.amount);
  if (amount > MAX_U64) return fail("INSUFFICIENT_FUNDS", "That’s more than your wallet holds.");
  const sol = request.asset === SOL_ASSET;
  const mint = sol ? null : publicKey(request.asset);
  if (!sol && !mint) return fail("INVALID_ASSET", "Unknown token.");

  try {
    const [destinationAccount, walletLamports, sponsorLamports, mintAccount, tokenAccounts, latest] = await Promise.all([
      getAccount(url, destination.toBase58()),
      getLamports(url, walletAddress),
      getLamports(url, payer.publicKey.toBase58()),
      mint ? getAccount(url, mint.toBase58()) : Promise.resolve(null),
      mint
        ? rpc<{ value: TokenAccountEntry[] }>(url, "getTokenAccountsByOwner", [walletAddress, { mint: mint.toBase58() }, { encoding: "jsonParsed", commitment: "confirmed" }]).then((r) => r.value)
        : Promise.resolve([]),
      rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>(url, "getLatestBlockhash", [{ commitment: "confirmed" }]).then((r) => r.value),
    ]);
    if (destinationAccount?.executable) return fail("INVALID_DESTINATION", "That’s a program address, not a wallet.");
    if (destinationAccount && (destinationAccount.owner === TOKEN_PROGRAM.toBase58() || destinationAccount.owner === TOKEN_2022_PROGRAM.toBase58())) {
      return fail("INVALID_DESTINATION", "That’s a token account or token address. Enter the recipient’s wallet address instead.");
    }
    if (sponsorLamports < minimumSponsorBalance(1)) return fail("PROVIDER_ERROR", "Fee sponsor is low on SOL; try again later");

    let instructions: TransactionInstruction[];
    let createsAccount = false;
    if (sol) {
      const balance = BigInt(walletLamports);
      if (amount > balance) return fail("INSUFFICIENT_FUNDS", "You don’t have that much SOL.");
      const left = balance - amount;
      if (left > 0n && left < MIN_WALLET_LAMPORTS) return fail("INSUFFICIENT_FUNDS", WALLET_MINIMUM);
      if (!destinationAccount && amount < MIN_WALLET_LAMPORTS) return fail("AMOUNT_TOO_SMALL", NEW_ADDRESS_MINIMUM);
      instructions = [SystemProgram.transfer({ fromPubkey: wallet, toPubkey: destination, lamports: amount })];
    } else {
      const program = mintAccount?.owner === TOKEN_PROGRAM.toBase58() ? TOKEN_PROGRAM : mintAccount?.owner === TOKEN_2022_PROGRAM.toBase58() ? TOKEN_2022_PROGRAM : null;
      const parsed = (mintAccount?.data as { parsed?: { type?: string; info?: MintInfo } } | undefined)?.parsed;
      if (!program || parsed?.type !== "mint" || !parsed.info || !Number.isInteger(parsed.info.decimals)) return fail("INVALID_ASSET", "That token couldn’t be found on Solana.");
      const extensions = parsed.info.extensions ?? [];
      const extension = (name: string) => extensions.find((item) => item.extension === name);
      if (extension("nonTransferable")) return fail("UNSUPPORTED_TOKEN", "This token can’t be transferred.");
      if (extension("transferHook")?.state?.programId) return fail("UNSUPPORTED_TOKEN", "This token runs custom transfer rules that Newsbid can’t send yet.");
      if (extension("pausableConfig")?.state?.paused === true) return fail("REJECTED", "Its issuer has paused transfers of this token right now.");
      const held = tokenAccounts
        .flatMap((entry) => {
          const info = entry.account.data.parsed?.info;
          const raw = info?.tokenAmount?.amount;
          return raw && /^\d+$/.test(raw) && info?.state !== "frozen" ? [{ address: new PublicKey(entry.pubkey), amount: BigInt(raw) }] : [];
        })
        .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));
      const source = held[0];
      if (!source || source.amount < amount) return fail("INSUFFICIENT_FUNDS", "You don’t hold that much of this token.");
      const recipientAccount = associatedTokenAddress(destination, mint!, program);
      createsAccount = !(await getAccount(url, recipientAccount.toBase58()));
      instructions = [
        ...(createsAccount ? [createAtaInstruction(wallet, recipientAccount, destination, mint!, program)] : []),
        transferCheckedInstruction(program, source.address, mint!, recipientAccount, wallet, amount, parsed.info.decimals),
      ];
    }

    const build = (units: number) =>
      new VersionedTransaction(
        new TransactionMessage({
          payerKey: payer.publicKey,
          recentBlockhash: latest.blockhash,
          instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICRO_LAMPORTS }), ...instructions],
        }).compileToV0Message(),
      );
    const draft = build(SIMULATION_COMPUTE_UNITS);
    const { value: simulation } = await rpc<{ value: Simulation }>(url, "simulateTransaction", [
      Buffer.from(draft.serialize()).toString("base64"),
      { encoding: "base64", sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed", accounts: { encoding: "base64", addresses: [walletAddress] } },
    ]);
    if (simulation.err) return simulationProblem(simulation, draft.message.staticAccountKeys, { wallet, destination, sol, ataInstruction: createsAccount ? 2 : -1 });

    // Fee payer is the paymaster, so the only SOL a token withdrawal takes from the wallet is the recipient account's rent.
    const after = simulation.accounts?.[0]?.lamports ?? 0;
    const rentLamports = createsAccount ? Math.max(0, walletLamports - after) : 0;
    const units = Math.min(SIMULATION_COMPUTE_UNITS, Math.ceil((simulation.unitsConsumed ?? SIMULATION_COMPUTE_UNITS) * 1.2) + 1_000);
    const transaction = build(units);
    transaction.sign([payer]);
    return {
      ok: true,
      value: { transaction: Buffer.from(transaction.serialize()).toString("base64"), lastValidBlockHeight: latest.lastValidBlockHeight, feePayer: payer.publicKey.toBase58(), createsAccount, rentLamports },
    };
  } catch (error) {
    console.warn("withdraw prepare failed", error instanceof Error ? error.message : error);
    return fail("PROVIDER_ERROR", "The Solana network is busy. Try again in a moment.");
  }
}
