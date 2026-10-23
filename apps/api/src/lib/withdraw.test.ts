import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { resetConfig, setSecrets } from "./config";
import { associatedTokenAddress, ATA_PROGRAM, prepareWithdrawal, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./withdraw";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAYMASTER = Keypair.generate();
const WALLET = Keypair.generate().publicKey;
const RECIPIENT = Keypair.generate().publicKey;
const SOURCE = Keypair.generate().publicKey;
const originalFetch = globalThis.fetch;

type Chain = {
  accounts: Record<string, { owner: string; lamports?: number; executable?: boolean; data?: unknown }>;
  balances: Record<string, number>;
  tokenAccounts: { pubkey: string; amount: string; state?: string }[];
  simulation: { err: unknown; logs?: string[]; unitsConsumed?: number; accounts?: ({ lamports: number } | null)[] };
};
let chain: Chain;
let simulated: VersionedTransaction | null;

const mintAccount = (program: PublicKey, decimals: number, extensions?: unknown[]) => ({ owner: program.toBase58(), data: { parsed: { type: "mint", info: { decimals, ...(extensions ? { extensions } : {}) } } } });

beforeEach(() => {
  setSecrets({ HeliusApiKey: "test", SolanaPaymasterKey: bs58.encode(PAYMASTER.secretKey) });
  simulated = null;
  chain = {
    accounts: { [USDC]: mintAccount(TOKEN_PROGRAM, 6), [associatedTokenAddress(RECIPIENT, new PublicKey(USDC), TOKEN_PROGRAM).toBase58()]: { owner: TOKEN_PROGRAM.toBase58() } },
    balances: { [WALLET.toBase58()]: 5_000_000, [PAYMASTER.publicKey.toBase58()]: 1_000_000_000 },
    tokenAccounts: [{ pubkey: SOURCE.toBase58(), amount: "25000000" }],
    simulation: { err: null, unitsConsumed: 10_000, accounts: [{ lamports: 5_000_000 }] },
  };
  globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
    const { method, params } = JSON.parse(String(init?.body)) as { method: string; params: any[] };
    const result = (() => {
      switch (method) {
        case "getAccountInfo": {
          const account = chain.accounts[params[0]];
          return { value: account ? { lamports: 1, executable: false, data: {}, ...account } : null };
        }
        case "getBalance": return { value: chain.balances[params[0]] ?? 0 };
        case "getTokenAccountsByOwner": return { value: chain.tokenAccounts.map(({ pubkey, amount, state }) => ({ pubkey, account: { data: { parsed: { info: { tokenAmount: { amount }, state: state ?? "initialized" } } } } })) };
        case "getLatestBlockhash": return { value: { blockhash: SystemProgram.programId.toBase58(), lastValidBlockHeight: 1234 } };
        case "simulateTransaction": simulated = VersionedTransaction.deserialize(Buffer.from(params[0], "base64")); return { value: chain.simulation };
        default: throw new Error(`unexpected ${method}`);
      }
    })();
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = originalFetch; resetConfig(); });

const request = (overrides: Partial<{ asset: string; amount: string; destination: string }> = {}) => ({ asset: USDC, amount: "10000000", destination: RECIPIENT.toBase58(), ...overrides });
const decode = (base64: string) => VersionedTransaction.deserialize(Buffer.from(base64, "base64"));
const programsOf = (tx: VersionedTransaction) => tx.message.compiledInstructions.map((ix) => tx.message.staticAccountKeys[ix.programIdIndex]!.toBase58());

it("builds a fee-sponsored TransferChecked to the recipient's existing token account", async () => {
  const result = await prepareWithdrawal(request(), WALLET.toBase58());
  if (!result.ok) throw new Error(result.error.message);
  expect(result.value).toMatchObject({ lastValidBlockHeight: 1234, feePayer: PAYMASTER.publicKey.toBase58(), createsAccount: false, rentLamports: 0 });
  const tx = decode(result.value.transaction);
  const keys = tx.message.staticAccountKeys;
  expect(keys[0]!.equals(PAYMASTER.publicKey)).toBe(true);
  expect(tx.message.header.numRequiredSignatures).toBe(2);
  expect(tx.signatures[0]!.some(Boolean)).toBe(true);
  expect(tx.signatures[1]!.every((byte) => byte === 0)).toBe(true);
  expect(programsOf(tx)).toEqual([ComputeBudgetProgram.programId.toBase58(), ComputeBudgetProgram.programId.toBase58(), TOKEN_PROGRAM.toBase58()]);
  const transfer = tx.message.compiledInstructions[2]!;
  const data = Buffer.from(transfer.data);
  expect([data[0], data.readBigUInt64LE(1), data[9]]).toEqual([12, 10_000_000n, 6]);
  expect(transfer.accountKeyIndexes.map((index) => keys[index]!.toBase58())).toEqual([
    SOURCE.toBase58(), USDC, associatedTokenAddress(RECIPIENT, new PublicKey(USDC), TOKEN_PROGRAM).toBase58(), WALLET.toBase58(),
  ]);
  // The paymaster only pays the fee: it appears in no instruction.
  expect(tx.message.compiledInstructions.some((ix) => ix.accountKeyIndexes.includes(0))).toBe(false);
});

it("opens a missing Token-2022 recipient account with rent from the user's wallet", async () => {
  const mint = Keypair.generate().publicKey.toBase58();
  chain.accounts[mint] = mintAccount(TOKEN_2022_PROGRAM, 8, [{ extension: "transferHook", state: { programId: null } }, { extension: "pausableConfig", state: { paused: false } }]);
  chain.simulation.accounts = [{ lamports: 5_000_000 - 2_100_000 }];
  const result = await prepareWithdrawal(request({ asset: mint, amount: "5" }), WALLET.toBase58());
  if (!result.ok) throw new Error(result.error.message);
  expect(result.value).toMatchObject({ createsAccount: true, rentLamports: 2_100_000 });
  const tx = decode(result.value.transaction);
  expect(programsOf(tx).slice(2)).toEqual([ATA_PROGRAM.toBase58(), TOKEN_2022_PROGRAM.toBase58()]);
  const create = tx.message.compiledInstructions[2]!;
  expect(tx.message.staticAccountKeys[create.accountKeyIndexes[0]!]!.equals(WALLET)).toBe(true);
  expect(Buffer.from(create.data)).toEqual(Buffer.from([1]));
  // Compute limit shrinks to the simulated usage plus headroom.
  expect(Buffer.from(tx.message.compiledInstructions[0]!.data).readUInt32LE(1)).toBe(13_000);
});

it("explains a recipient account the wallet can't afford to open", async () => {
  const mint = Keypair.generate().publicKey.toBase58();
  chain.accounts[mint] = mintAccount(TOKEN_PROGRAM, 6);
  chain.simulation = { err: { InstructionError: [2, { Custom: 1 }] }, logs: ["Transfer: insufficient lamports 0, need 2039280"] };
  expect(await prepareWithdrawal(request({ asset: mint }), WALLET.toBase58())).toMatchObject({ ok: false, error: { code: "NEEDS_SOL" } });
  expect(simulated).not.toBeNull();
});

it("rejects bad destinations and balances before simulating", async () => {
  const tokenAccount = associatedTokenAddress(RECIPIENT, new PublicKey(USDC), TOKEN_PROGRAM).toBase58();
  for (const [overrides, code] of [
    [{ destination: WALLET.toBase58() }, "INVALID_DESTINATION"],
    [{ destination: PAYMASTER.publicKey.toBase58() }, "INVALID_DESTINATION"],
    [{ destination: tokenAccount }, "INVALID_DESTINATION"],
    [{ amount: "25000001" }, "INSUFFICIENT_FUNDS"],
    [{ asset: Keypair.generate().publicKey.toBase58() }, "INVALID_ASSET"],
  ] as const) {
    expect(await prepareWithdrawal(request(overrides), WALLET.toBase58())).toMatchObject({ ok: false, error: { code } });
  }
  const hooked = Keypair.generate().publicKey.toBase58();
  chain.accounts[hooked] = mintAccount(TOKEN_2022_PROGRAM, 6, [{ extension: "transferHook", state: { programId: Keypair.generate().publicKey.toBase58() } }]);
  expect(await prepareWithdrawal(request({ asset: hooked }), WALLET.toBase58())).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_TOKEN" } });
  expect(simulated).toBeNull();
});

it("sends SOL, keeping the wallet and a new recipient rent-exempt", async () => {
  chain.balances[RECIPIENT.toBase58()] = 0;
  expect(await prepareWithdrawal(request({ asset: "SOL", amount: "4500000" }), WALLET.toBase58())).toMatchObject({ ok: false, error: { code: "INSUFFICIENT_FUNDS" } });
  expect(await prepareWithdrawal(request({ asset: "SOL", amount: "5000001" }), WALLET.toBase58())).toMatchObject({ ok: false, error: { code: "INSUFFICIENT_FUNDS" } });
  chain.balances[WALLET.toBase58()] = 100_000;
  expect(await prepareWithdrawal(request({ asset: "SOL", amount: "100000" }), WALLET.toBase58())).toMatchObject({ ok: false, error: { code: "AMOUNT_TOO_SMALL" } });
  chain.balances[WALLET.toBase58()] = 5_000_000;
  const result = await prepareWithdrawal(request({ asset: "SOL", amount: "5000000" }), WALLET.toBase58());
  if (!result.ok) throw new Error(result.error.message);
  const tx = decode(result.value.transaction);
  expect(programsOf(tx)[2]).toBe(SystemProgram.programId.toBase58());
  const transfer = tx.message.compiledInstructions[2]!;
  expect(transfer.accountKeyIndexes.map((index) => tx.message.staticAccountKeys[index]!.toBase58())).toEqual([WALLET.toBase58(), RECIPIENT.toBase58()]);
  expect(Buffer.from(transfer.data).readBigUInt64LE(4)).toBe(5_000_000n);
});

it("maps a rent failure on a new SOL recipient and needs a configured paymaster", async () => {
  chain.accounts[RECIPIENT.toBase58()] = { owner: SystemProgram.programId.toBase58() };
  chain.simulation = { err: { InsufficientFundsForRent: { account_index: 2 } } };
  const result = await prepareWithdrawal(request({ asset: "SOL", amount: "1000000" }), WALLET.toBase58());
  expect(simulated!.message.staticAccountKeys[2]!.equals(RECIPIENT)).toBe(true);
  expect(result).toMatchObject({ ok: false, error: { code: "AMOUNT_TOO_SMALL" } });
  setSecrets({ SolanaPaymasterKey: undefined });
  expect(await prepareWithdrawal(request(), WALLET.toBase58())).toMatchObject({ ok: false, error: { code: "PROVIDER_NOT_CONFIGURED" } });
});
