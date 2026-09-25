import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { setFeatures } from "./config";
import { brandColorFor, decodePng, expireBrandColor, pickBrandColor, resetBrandColorCache } from "./brand-color";
import { encodePng, type Pixel } from "./png.fixture";

const originalFetch = globalThis.fetch;
const icon = "https://xstocks-metadata.backed.fi/logos/tokens/TESTx.png";
const solid = (r: number, g: number, b: number): Pixel => () => [r, g, b, 255];
// Logo-like: transparent background, blue disc, white glyph in the middle, thin black outline ring.
const logo: Pixel = (x, y) => {
  const d = Math.hypot(x - 32, y - 32);
  if (d > 30) return [0, 0, 0, 0];
  if (d > 28) return [0, 0, 0, 255];
  if (Math.abs(x - 32) < 4 && y > 18 && y < 46) return [255, 255, 255, 255];
  return [20, 90, 220, 255];
};
const pngResponse = (bytes: Uint8Array, init: ResponseInit = {}) => new Response(bytes, { headers: { "content-type": "image/png", ...(init.headers as Record<string, string>) }, ...init });

beforeEach(() => { resetBrandColorCache(); setFeatures({ brandColors: true }); });
afterEach(() => { globalThis.fetch = originalFetch; });

it("decodes RGBA PNGs with each supported filter into exact pixels", async () => {
  for (const filter of [0, 1, 2] as const) {
    const image = await decodePng(encodePng(5, 3, (x, y) => [x * 40, y * 90, 200, 255], { filter }));
    expect([image.width, image.height]).toEqual([5, 3]);
    expect([...image.data.subarray((2 * 5 + 3) * 4, (2 * 5 + 3) * 4 + 4)]).toEqual([120, 180, 200, 255]);
  }
  await expect(decodePng(new Uint8Array([1, 2, 3]))).rejects.toThrow(/Not a PNG/);
});

it("picks the exact colour of a solid icon", async () => {
  expect(pickBrandColor(await decodePng(encodePng(40, 40, solid(200, 30, 30))))).toBe("#c81e1e");
});

it("ignores transparent, white and black pixels in a logo-like icon and picks the saturated fill", async () => {
  expect(pickBrandColor(await decodePng(encodePng(64, 64, logo)))).toBe("#145adc");
});

it("returns null for an all-white icon and darkens overly light colours for use on white", async () => {
  expect(pickBrandColor(await decodePng(encodePng(32, 32, (x, y) => Math.hypot(x - 16, y - 16) < 14 ? [255, 255, 255, 255] : [0, 0, 0, 0])))).toBeNull();
  const pale = pickBrandColor(await decodePng(encodePng(32, 32, solid(250, 240, 120))))!;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(pale.slice(i, i + 2), 16)) as [number, number, number];
  expect(r).toBeGreaterThan(b); expect(g).toBeGreaterThan(b); // still yellow
  expect((Math.max(r, g, b) + Math.min(r, g, b)) / 510).toBeLessThanOrEqual(0.62);
  expect(pickBrandColor(await decodePng(encodePng(32, 32, solid(128, 128, 128))))).toBe("#808080"); // grey is allowed
  expect(pickBrandColor(await decodePng(encodePng(32, 32, solid(10, 10, 12))))).toBe("#0a0a0c"); // near-black only as last resort
});

it("fetches only allowlisted https icon hosts, caches the colour, and never throws on failures", async () => {
  const bytes = encodePng(40, 40, solid(200, 30, 30));
  const calls = mock(async (input: string | URL | Request, init?: RequestInit) => {
    expect(init?.redirect).toBe("manual");
    return pngResponse(bytes);
  });
  globalThis.fetch = calls as unknown as typeof fetch;
  expect(await brandColorFor("https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/apple.svg")).toBeNull();
  expect(await brandColorFor("http://xstocks-metadata.backed.fi/logos/tokens/TESTx.png")).toBeNull();
  expect(calls).not.toHaveBeenCalled();
  const [first, second] = await Promise.all([brandColorFor(icon), brandColorFor(icon)]);
  expect(first).toBe("#c81e1e"); expect(second).toBe("#c81e1e");
  expect(await brandColorFor(icon)).toBe("#c81e1e");
  expect(calls).toHaveBeenCalledTimes(1);
  setFeatures({ brandColors: false });
  expect(await brandColorFor(icon)).toBeNull();
  setFeatures({ brandColors: true });

  const failures: (() => Response | Promise<Response>)[] = [
    () => new Response("missing", { status: 404, headers: { "content-type": "image/png" } }),
    () => new Response(bytes, { headers: { "content-type": "text/html" } }),
    () => pngResponse(bytes, { headers: { "content-length": String(600 * 1024) } }),
    () => pngResponse(new Uint8Array(513 * 1024)),
    () => pngResponse(new Uint8Array([1, 2, 3, 4])),
    () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); },
  ];
  for (const [i, failure] of failures.entries()) {
    resetBrandColorCache();
    globalThis.fetch = mock(async () => failure()) as unknown as typeof fetch;
    expect(await brandColorFor(`${icon}?case=${i}`)).toBeNull();
  }
});

it("follows one redirect only within allowlisted hosts", async () => {
  const bytes = encodePng(8, 8, solid(20, 90, 220));
  const redirect = (location: string) => new Response(null, { status: 301, headers: { location } });
  let hops = 0;
  globalThis.fetch = mock(async (input: string | URL | Request) => String(input).startsWith("https://www.prestocks.com/") ? (hops++, redirect("https://prestocks.com/logos/openai.png?cachebust=1")) : pngResponse(bytes)) as unknown as typeof fetch;
  expect(await brandColorFor("https://www.prestocks.com/logos/openai.png?cachebust=1")).toBe("#145adc");
  expect(hops).toBe(1);
  resetBrandColorCache();
  const offHost = mock(async (input: string | URL | Request) => String(input).startsWith("https://www.prestocks.com/") ? redirect("https://evil.example/logo.png") : pngResponse(bytes));
  globalThis.fetch = offHost as unknown as typeof fetch;
  expect(await brandColorFor("https://www.prestocks.com/logos/openai.png")).toBeNull();
  expect(offHost).toHaveBeenCalledTimes(1);
  resetBrandColorCache();
  globalThis.fetch = mock(async () => redirect("https://prestocks.com/logos/openai.png")) as unknown as typeof fetch;
  expect(await brandColorFor("https://www.prestocks.com/logos/openai.png")).toBeNull(); // second redirect is not followed
});

it("keeps the last good colour when a refresh fails", async () => {
  const bytes = encodePng(8, 8, solid(20, 90, 220));
  globalThis.fetch = mock(async () => pngResponse(bytes)) as unknown as typeof fetch;
  expect(await brandColorFor(icon)).toBe("#145adc");
  expireBrandColor(icon);
  const down = mock(async () => new Response("down", { status: 503 }));
  globalThis.fetch = down as unknown as typeof fetch;
  expect(await brandColorFor(icon)).toBe("#145adc");
  expect(await brandColorFor(icon)).toBe("#145adc");
  expect(down).toHaveBeenCalledTimes(1);
  resetBrandColorCache();
  expect(await brandColorFor(icon)).toBeNull();
});
