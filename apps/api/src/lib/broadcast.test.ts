import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { readStatuses, SENDER_URL, submitSigned } from "./broadcast";
import { resetConfig, setSecrets } from "./config";

const originalFetch = globalThis.fetch;
beforeEach(() => setSecrets({ HeliusApiKey: "test", SolanaPaymasterKey: undefined }));
afterEach(() => { globalThis.fetch = originalFetch; resetConfig(); });

function signedTransaction() {
  const wallet = Keypair.generate();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: wallet.publicKey,
    recentBlockhash: SystemProgram.programId.toBase58(), instructions: [] }).compileToV0Message());
  tx.sign([wallet]);
  return { base64: Buffer.from(tx.serialize()).toString("base64"), wallet: wallet.publicKey.toBase58(), signature: bs58.encode(tx.signatures[0]!) };
}

it("keeps simulation and signature rejections definitive without trying Sender", async () => {
  const tx = signedTransaction();
  for (const error of [{ code: -32002, message: "Transaction simulation failed", data: { logs: ["SlippageToleranceExceeded"] } },
    { code: -32003, message: "Transaction signature verification failure" }, { code: -32123, message: "Unknown rejection" }]) {
    const calls: string[] = [];
    globalThis.fetch = mock(async (input) => { calls.push(String(input)); return Response.json({ error }); }) as unknown as typeof fetch;
    expect(await submitSigned(tx.base64, tx.wallet)).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(1);
  }
});

it("falls back to Sender for transient JSON-RPC errors and returns 503 when it cannot send", async () => {
  const tx = signedTransaction();
  for (const error of [{ code: -32603, message: "Internal error" }, { code: -32005, message: "Node is behind" },
    { code: 429, message: "Rate limit exceeded" }, { code: -32016, message: "Minimum context slot has not been reached" }]) {
    for (const senderOk of [true, false]) {
      const calls: string[] = [];
      globalThis.fetch = mock(async (input) => {
        calls.push(String(input));
        return Response.json(String(input) === SENDER_URL && senderOk ? { result: tx.signature } : { error });
      }) as unknown as typeof fetch;
      expect(await submitSigned(tx.base64, tx.wallet)).toMatchObject(senderOk ? { ok: true, signature: tx.signature } : { ok: false, status: 503 });
      expect(calls).toHaveLength(2);
      expect(calls[1]).toBe(SENDER_URL);
    }
  }
});

it("accepts an already processed transaction", async () => {
  const tx = signedTransaction();
  globalThis.fetch = mock(async () => Response.json({ error: { code: -32002, message: "Transaction has already been processed" } })) as unknown as typeof fetch;
  expect(await submitSigned(tx.base64, tx.wallet)).toEqual({ ok: true, signature: tx.signature });
});

it("executes an order with its requestId, returning any signature for status polling", async () => {
  const tx = signedTransaction();
  setSecrets({ JupiterApiKey: "test", HeliusApiKey: undefined });
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe("https://api.jup.ag/swap/v2/execute");
    expect(JSON.parse(String(init?.body))).toEqual({ signedTransaction: tx.base64, requestId: "order-1" });
    expect(init?.method).toBe("POST");
    return Response.json({ status: "Failed", code: -1003, signature: tx.signature });
  }) as unknown as typeof fetch;
  expect(await submitSigned(tx.base64, tx.wallet, "order-1")).toEqual({ ok: true, signature: tx.signature });
});

it("maps definitive execute errors to 400 and unknown/transient outcomes to 503", async () => {
  const tx = signedTransaction();
  setSecrets({ JupiterApiKey: "test" });
  for (const code of [-1, -2, -3, -4, -5, -1002, -1003, -1004, -2002, -2003, -2004, -1000, -1001, -1006, -2000, -2001, -2005, -9999]) {
    const definitive = [-1, -2, -3, -4, -5, -1002, -1003, -1004, -2002, -2003, -2004].includes(code);
    globalThis.fetch = mock(async () => Response.json({ status: "Failed", code, error: "Execution failed" })) as unknown as typeof fetch;
    expect(await submitSigned(tx.base64, tx.wallet, "order-1")).toEqual({ ok: false, status: definitive ? 400 : 503, error: "Execution failed" });
  }
  globalThis.fetch = mock(async () => Response.json({ code: -1003, error: "upstream" }, { status: 503 })) as unknown as typeof fetch;
  expect(await submitSigned(tx.base64, tx.wallet, "order-1")).toMatchObject({ ok: false, status: 503 });
  globalThis.fetch = mock(async () => { throw new Error("network"); }) as unknown as typeof fetch;
  expect(await submitSigned(tx.base64, tx.wallet, "order-1")).toMatchObject({ ok: false, status: 503 });
});

it("reports null signature statuses as expired only after their supplied last-valid height", async () => {
  const calls: string[] = [];
  globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); calls.push(body.method);
    return Response.json({ result: body.method === "getBlockHeight" ? 101 : { value: [null, null, { confirmationStatus: "confirmed", err: null }, { confirmationStatus: "processed", err: null }] } });
  }) as unknown as typeof fetch;
  expect(await readStatuses(["a", "b", "c", "d"], { a: 100, b: 101, c: 50, d: 50 })).toEqual({ ok: true, statuses: [
    { signature: "a", status: "failed", error: "expired" }, { signature: "b", status: "pending", error: null },
    { signature: "c", status: "confirmed", error: null }, { signature: "d", status: "pending", error: null },
  ] });
  expect(calls).toEqual(["getSignatureStatuses", "getBlockHeight"]);
  calls.length = 0;
  await readStatuses(["a", "b", "c", "d"]);
  expect(calls).toEqual(["getSignatureStatuses"]);
});
