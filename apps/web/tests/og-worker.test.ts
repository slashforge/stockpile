import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import worker from "../worker/index";
import { bagMeta, cardPath, hourBucket, injectMeta, metaTags, OG_VERSION, sharePage } from "../worker/og";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Newsbid</title>
    <meta name="description" content="Default" />
    <meta property="og:title" content="Default" />
    <meta property="og:image" content="/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body><div id="root"></div><script type="module" src="/assets/app.js"></script></body>
</html>`;

const BAG = {
  id: "ai-infrastructure",
  title: "AI Infrastructure",
  subtitle: "Hardware, platforms, and compute",
  assets: [
    { symbol: "MSFTx", name: "Microsoft xStock", weightBps: 1400 },
    { symbol: "NVDAx", name: "NVIDIA xStock", weightBps: 2400 },
  ],
};

const env = {
  OG_ORIGIN: "https://og.example",
  API_ORIGIN: "https://api.example",
  ASSETS: {
    async fetch(request: Request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/og-image.png") return new Response("png", { headers: { "content-type": "image/png" } });
      if (pathname.startsWith("/assets/")) return new Response("js", { headers: { "content-type": "text/javascript" } });
      return new Response(INDEX, { headers: { "content-type": "text/html; charset=utf-8", etag: "abc" } });
    },
  },
};
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) };
const realFetch = globalThis.fetch;

// Minimal stand-in for Cloudflare's caches.default.
const store = new Map<string, Response>();
const g = globalThis as unknown as { caches?: unknown };
beforeEach(() => {
  store.clear();
  pending = [];
  g.caches = {
    default: {
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, response: Response) => void store.set(key, response),
    },
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete g.caches;
});

function mockUpstream(handler: (url: string) => Response | Promise<Response>) {
  const fn = mock((input: string | URL | Request) => Promise.resolve(handler(typeof input === "string" ? input : input.toString())));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("share routes", () => {
  it("recognises bag and asset links only", () => {
    expect(sharePage("/bag/ai-infrastructure")).toEqual({ kind: "bag", id: "ai-infrastructure" });
    expect(sharePage("/bag/ai-infrastructure/")).toEqual({ kind: "bag", id: "ai-infrastructure" });
    expect(sharePage("/asset/NVDAx")).toEqual({ kind: "asset", symbol: "NVDAx" });
    expect(sharePage("/bag/../etc")).toEqual({ kind: "default" });
    expect(sharePage("/buy/ai-infrastructure")).toEqual({ kind: "default" });
  });

  it("versions dynamic card URLs by hour and keeps the default static", () => {
    const now = new Date("2026-10-23T03:41:00Z");
    expect(hourBucket(now)).toBe("2026102303");
    expect(cardPath({ kind: "bag", id: "ai-infrastructure" }, now)).toBe(`/og/bag/ai-infrastructure.png?v=${OG_VERSION}&t=2026102303`);
    expect(cardPath({ kind: "default" }, now)).toBe("/og-image.png");
  });

  it("describes a bag by its heaviest holdings", () => {
    expect(bagMeta(BAG)).toEqual({
      title: "AI Infrastructure · Newsbid",
      description: "Hardware, platforms, and compute. 2 tokens, led by NVDAx, MSFTx. See every weight, source and risk, then buy the bag in one slide.",
    });
  });

  it("replaces existing preview tags and escapes values", () => {
    const html = injectMeta(INDEX, metaTags({ title: 'Say "hi" <b>', description: "a & b" }, "https://app.example/x", "https://app.example/og.png"));
    expect(html.match(/<title>/g)?.length).toBe(1);
    expect(html.match(/property="og:title"/g)?.length).toBe(1);
    expect(html).toContain("<title>Say &quot;hi&quot; &lt;b&gt;</title>");
    expect(html).toContain('content="a &amp; b"');
    expect(html).not.toContain('content="Default"');
    expect(html).toContain('<script type="module" src="/assets/app.js"></script>');
  });
});

describe("router worker", () => {
  it("serves bag links with the bag's tags and a dynamic card", async () => {
    mockUpstream((url) => {
      expect(url).toBe("https://api.example/bags/ai-infrastructure");
      return Response.json({ bag: BAG });
    });
    const response = await worker.fetch(new Request("https://app.example/bag/ai-infrastructure"), env, ctx);
    const html = await response.text();
    expect(response.headers.get("etag")).toBeNull();
    expect(html).toContain("<title>AI Infrastructure · Newsbid</title>");
    expect(html).toMatch(new RegExp(`property="og:image" content="https://app\\.example/og/bag/ai-infrastructure\\.png\\?v=${OG_VERSION}&amp;t=\\d{10}"`));
    expect(html).toContain('property="og:url" content="https://app.example/bag/ai-infrastructure"');
  });

  it("serves cached preview text without calling the API", async () => {
    const fetchSpy = mockUpstream(() => Response.json({ bag: BAG }));
    await worker.fetch(new Request("https://app.example/bag/ai-infrastructure"), env, ctx);
    await Promise.all(pending);
    const html = await (await worker.fetch(new Request("https://app.example/bag/ai-infrastructure"), env, ctx)).text();
    expect(html).toContain("<title>AI Infrastructure · Newsbid</title>");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not wait on a slow API, but warms the cache for the next request", async () => {
    mockUpstream(() => new Promise((resolve) => setTimeout(() => resolve(Response.json({ bag: BAG })), 3000)));
    const started = Date.now();
    const first = await (await worker.fetch(new Request("https://app.example/bag/ai-infrastructure"), env, ctx)).text();
    expect(Date.now() - started).toBeLessThan(2900);
    expect(first).toContain("<title>Newsbid — Swipe the news. Buy the bag.</title>");
    await Promise.all(pending);
    const second = await (await worker.fetch(new Request("https://app.example/bag/ai-infrastructure"), env, ctx)).text();
    expect(second).toContain("<title>AI Infrastructure · Newsbid</title>");
  }, 10_000);

  it("falls back to the default tags when the API is down", async () => {
    mockUpstream(() => {
      throw new Error("offline");
    });
    const html = await (await worker.fetch(new Request("https://app.example/bag/ai-infrastructure"), env, ctx)).text();
    expect(html).toContain("<title>Newsbid — Swipe the news. Buy the bag.</title>");
  });

  it("gives other pages the absolute static card", async () => {
    const fetchSpy = mockUpstream(() => new Response("unexpected", { status: 500 }));
    const html = await (await worker.fetch(new Request("https://app.example/bags"), env, ctx)).text();
    expect(html).toContain('property="og:image" content="https://app.example/og-image.png"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes non-HTML assets through untouched", async () => {
    const response = await worker.fetch(new Request("https://app.example/assets/app.js"), env, ctx);
    expect(await response.text()).toBe("js");
  });

  it("proxies cards from the OG function", async () => {
    mockUpstream((url) => {
      expect(url).toBe("https://og.example/bag/ai-infrastructure.png");
      return new Response("PNG", { headers: { "content-type": "image/png" } });
    });
    const response = await worker.fetch(new Request("https://app.example/og/bag/ai-infrastructure.png?v=1&t=2026102303"), env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(await response.text()).toBe("PNG");
  });

  it("caches cards rendered without live numbers only briefly", async () => {
    mockUpstream(() => new Response("PNG", { headers: { "content-type": "image/png", "x-newsbid-og-partial": "1" } }));
    const response = await worker.fetch(new Request("https://app.example/og/bag/ai-infrastructure.png"), env, ctx);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("redirects to the static card when a dynamic card fails", async () => {
    mockUpstream(() => new Response("Not found", { status: 404 }));
    const response = await worker.fetch(new Request("https://app.example/og/bag/nope.png"), env, ctx);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example/og-image.png");
  });
});
