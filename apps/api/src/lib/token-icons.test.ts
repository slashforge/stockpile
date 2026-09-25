import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { assetIcon } from "./token-icons";
import { resetBrandColorCache } from "./brand-color";
import { encodePng } from "./png.fixture";

const previousKey = process.env.JUPITER_API_KEY;
const originalFetch = globalThis.fetch;
beforeEach(() => { resetBrandColorCache(); });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.JUPITER_API_KEY;
  else process.env.JUPITER_API_KEY = previousKey;
});
const mintA = "55555555555555555555555555555555";
const mintB = "66666666666666666666666666666666";
const mintC = "77777777777777777777777777777777";
const issuerIcon = "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png";
const redPng = encodePng(16, 16, () => [200, 30, 30, 255]);
const isIcon = (input: string | URL | Request) => /\.png$/.test(new URL(String(input)).pathname);

it("uses explicit underlying brand icon without querying Jupiter for a mintless asset", async () => {
  process.env.JUPITER_API_KEY = "test";
  const calls = mock(async () => { throw new Error("must not search by symbol"); });
  globalThis.fetch = calls as unknown as typeof fetch;
  expect(await assetIcon("AAPLx", null)).toMatchObject({ iconSource: "underlying-brand", iconUrl: expect.stringContaining("apple.svg"), brandColor: null });
  expect(await assetIcon("UNKNOWNx", null)).toEqual({ iconUrl: null, iconSource: null, brandColor: null });
  expect(calls).not.toHaveBeenCalled();
});

it("queries Jupiter only by configured mint, caches an exact-match HTTPS token icon, and derives its brand colour once", async () => {
  process.env.JUPITER_API_KEY = "test";
  let searches = 0, images = 0;
  const calls = mock(async (input: string | URL | Request, options?: RequestInit) => {
    if (isIcon(input)) { images++; expect(String(input)).toBe(issuerIcon); return new Response(redPng, { headers: { "content-type": "image/png" } }); }
    searches++;
    expect(new URL(String(input)).searchParams.get("query")).toBe(mintA);
    expect((options?.headers as Record<string, string>)["x-api-key"]).toBe("test");
    return Response.json([{ id: mintB, icon: "https://example.com/wrong.png" }, { id: mintA, icon: issuerIcon }]);
  });
  globalThis.fetch = calls as unknown as typeof fetch;
  const [first, second] = await Promise.all([assetIcon("AAPLx", mintA), assetIcon("AAPLx", mintA)]);
  expect(first).toEqual({ iconUrl: issuerIcon, iconSource: "jupiter-token", brandColor: "#c81e1e" });
  expect(second).toEqual(first);
  expect(await assetIcon("AAPLx", mintA)).toEqual(first);
  expect(searches).toBe(1);
  expect(images).toBe(1);
});

it("does not fetch images from non-issuer hosts and still returns the icon", async () => {
  process.env.JUPITER_API_KEY = "test";
  const calls = mock(async (input: string | URL | Request) => {
    if (isIcon(input)) throw new Error("must not fetch a non-allowlisted icon host");
    return Response.json([{ id: mintB, icon: "https://cdn.example.com/token.png" }]);
  });
  globalThis.fetch = calls as unknown as typeof fetch;
  expect(await assetIcon("MSFTx", mintB)).toEqual({ iconUrl: "https://cdn.example.com/token.png", iconSource: "jupiter-token", brandColor: null });
});

it("rejects a mismatched or unsafe URL and falls back without retrying every browse", async () => {
  process.env.JUPITER_API_KEY = "test";
  const calls = mock(async () => Response.json([{ id: mintB, icon: "https://cdn.example.com/other.png" }, { id: mintC, icon: "http://127.0.0.1/logo.png" }]));
  globalThis.fetch = calls as unknown as typeof fetch;
  expect((await assetIcon("NVDAx", mintC)).iconSource).toBe("underlying-brand");
  expect((await assetIcon("NVDAx", mintC)).iconSource).toBe("underlying-brand");
  expect(calls).toHaveBeenCalledTimes(1);
});

it("handles Jupiter failures without breaking discovery", async () => {
  process.env.JUPITER_API_KEY = "test";
  const calls = mock(async () => { throw new Error("provider down"); });
  globalThis.fetch = calls as unknown as typeof fetch;
  expect((await assetIcon("TSLAx", "88888888888888888888888888888888")).iconSource).toBe("underlying-brand");
  expect(calls).toHaveBeenCalledTimes(1);
});

it("uses issuer token artwork and its colour when Jupiter is unavailable, and null colour when the image fails", async () => {
  process.env.JUPITER_API_KEY = "test";
  globalThis.fetch = mock(async (input: string | URL | Request) => isIcon(input) ? new Response(redPng, { headers: { "content-type": "image/png" } }) : new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
  expect(await assetIcon("AAPLx", "99999999999999999999999999999999", issuerIcon)).toEqual({ iconSource: "issuer-token", iconUrl: issuerIcon, brandColor: "#c81e1e" });
  resetBrandColorCache();
  globalThis.fetch = mock(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
  expect(await assetIcon("MSFTx", "99999999999999999999999999999998", "https://xstocks-metadata.backed.fi/logos/tokens/MSFTx.png")).toEqual({ iconSource: "issuer-token", iconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/MSFTx.png", brandColor: null });
});
