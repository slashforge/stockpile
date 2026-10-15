import { afterEach, expect, it, mock } from "bun:test";
import { resetConfig, setSecrets } from "./config";
import { execute, JupiterError, order } from "./jupiter";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; resetConfig(); });

it("omits automatic slippage and taker on indicative orders, includes explicit sponsorship parameters", async () => {
  setSecrets({ JupiterApiKey: "test" });
  const urls: URL[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request) => { urls.push(new URL(String(input))); return Response.json({}); }) as unknown as typeof fetch;
  const params = { inputMint: "a", outputMint: "b", amount: "100" };
  await order(params);
  await order({ ...params, taker: "wallet", payer: "sponsor", closeAuthority: "wallet", excludeDexes: "Manifest", slippageBps: 75 });
  expect(urls[0]!.pathname).toBe("/swap/v2/order");
  expect(urls[0]!.searchParams.has("slippageBps")).toBe(false);
  expect(urls[0]!.searchParams.has("taker")).toBe(false);
  expect(Object.fromEntries(urls[1]!.searchParams)).toEqual({ ...params, taker: "wallet", payer: "sponsor", closeAuthority: "wallet", excludeDexes: "Manifest", slippageBps: "75" });
});

it("uses typed HTTP and timeout errors without exposing the API key", async () => {
  setSecrets({ JupiterApiKey: "secret-test" });
  globalThis.fetch = mock(async () => Response.json({ code: -1003, error: "Rejected" }, { status: 400 })) as unknown as typeof fetch;
  try { await execute("tx", "request"); throw new Error("expected rejection"); }
  catch (error) { expect(error).toBeInstanceOf(JupiterError); expect(error).toMatchObject({ status: 400, code: -1003, message: "Rejected" }); }
  globalThis.fetch = mock(async () => { throw Object.assign(new Error("secret-test"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
  try { await execute("tx", "request"); throw new Error("expected timeout"); }
  catch (error) { expect(error).toBeInstanceOf(JupiterError); expect(error).toMatchObject({ status: null, timeout: true, message: "Jupiter unavailable" }); }
});
