import { afterEach, expect, it, mock } from "bun:test";
import { renderRoute } from "./handler";

const env = { apiUrl: "https://api.example", appHost: "app.example" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const asset = (symbol: string, weightBps: number) => ({
  symbol,
  name: `${symbol} xStock`,
  weightBps,
  issuer: "xstocks",
  iconUrl: null,
  brandColor: "#2563eb",
  market: { usdPrice: 100, priceChange24hPct: 1.2 },
});
const BAG = {
  id: "ai-infrastructure",
  title: "AI Infrastructure",
  subtitle: "Hardware, platforms, and compute",
  sourceType: "editorial",
  issuer: "xstocks",
  curator: { kind: "editorial", name: "Newsbid Editorial" },
  tradable: true,
  market: { change24hPct: -0.4 },
  assets: [asset("NVDAx", 6000), asset("MSFTx", 4000)],
};

function api(marketReady = true) {
  const fn = mock(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const bag = marketReady ? BAG : { ...BAG, market: null, assets: BAG.assets.map((a) => ({ ...a, market: null })) };
    if (url.endsWith("/bags/ai-infrastructure")) return Response.json({ bag });
    if (url.endsWith("/bags/returns")) return Response.json({ returns: { "ai-infrastructure": { "1M": 4.2, "1Y": null, sparkline1M: [{ t: 1, value: 100 }, { t: 2, value: 104.2 }] } } });
    if (url.endsWith("/bags")) return Response.json({ bags: [bag] });
    return new Response("not found", { status: 404 });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const isPng = (body: Buffer | string) => typeof body !== "string" && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

it("rejects paths that are not cards without calling the API", async () => {
  const fetchSpy = api();
  for (const path of ["/", "/bag/AI.png", "/bag/../x.png", "/asset/a%2Fb.png", "/bag/ai-infrastructure"]) {
    expect((await renderRoute(path, env)).status).toBe(404);
  }
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("renders a bag card from API data and caches it", async () => {
  api();
  const first = await renderRoute("/bag/ai-infrastructure.png", env);
  expect(first.status).toBe(200);
  expect(first.headers["content-type"]).toBe("image/png");
  expect(first.headers["x-newsbid-og-cache"]).toBe("miss");
  expect(isPng(first.body)).toBe(true);
  const second = await renderRoute("/bag/ai-infrastructure.png", env);
  expect(second.headers["x-newsbid-og-cache"]).toBe("hit");
});

it("renders an asset card and 404s unknown ids", async () => {
  api();
  const card = await renderRoute("/asset/NVDAx.png", env);
  expect(card.status).toBe(200);
  expect(isPng(card.body)).toBe(true);
  expect((await renderRoute("/asset/NOPEx.png", env)).status).toBe(404);
  expect((await renderRoute("/bag/unknown-bag.png", env)).status).toBe(404);
});

it("renders without live numbers but marks the card partial and skips the memory cache", async () => {
  api(false);
  const first = await renderRoute("/asset/MSFTx.png", env);
  expect(first.status).toBe(200);
  expect(first.headers["x-newsbid-og-partial"]).toBe("1");
  expect(first.headers["cache-control"]).toBe("public, max-age=60");
  api(true);
  const second = await renderRoute("/asset/MSFTx.png", env);
  expect(second.headers["x-newsbid-og-cache"]).toBe("miss");
  expect(second.headers["x-newsbid-og-partial"]).toBeUndefined();
});
