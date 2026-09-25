import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "./app";
import { resetMintRegistry, seedMints } from "./lib/mint-registry";

const keys = ["STOCKPILE_XSTOCKS", "STOCKPILE_PRESTOCKS", "STOCKPILE_BRAND_COLORS", "STOCKPILE_MARKET", "JUPITER_API_KEY", "TOKENS_API_KEY"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const verified = { MSFTx: "22222222222222222222222222222222", GOOGLx: "33333333333333333333333333333333", AMZNx: "44444444444444444444444444444444", PLTRx: "55555555555555555555555555555555", ORCLx: "66666666666666666666666666666666" };
// Bun loads the root .env: without these overrides the suite would call Jupiter / issuer CDNs for fake mints and time out offline.
beforeEach(() => {
  process.env.STOCKPILE_XSTOCKS = "0"; resetMintRegistry(); delete process.env.JUPITER_API_KEY; delete process.env.TOKENS_API_KEY; process.env.STOCKPILE_PRESTOCKS = "0"; process.env.STOCKPILE_BRAND_COLORS = "0"; process.env.STOCKPILE_MARKET = "0"; });
afterEach(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });

type Bag = { id: string; sourceType: string; issuer: string; assetClass: string; risks: string[]; disclosure: string; tradable: boolean; tradableReason: string | null; curator: { kind: string; name: string }; market: unknown; assets: { symbol: string; weightBps: number; mint: string | null; decimals: number | null; uiAmountMultiplier: number; issuer: string; assetClass: string; reference: unknown; iconUrl: string | null; iconSource: string | null }[]; sources: { url: string }[] };

describe("public bags and auth boundaries", () => {
  it("returns ten editorial and two disclosure bags that are research-only without an allowlist or issuer directory", async () => {
    const response = await app.request("/bags");
    expect(response.status).toBe(200);
    const { bags } = await response.json() as { bags: Bag[] };
    expect(bags.map((bag) => [bag.id, bag.issuer, bag.assetClass])).toEqual([
      ["megacap-builders", "xstocks", "public-equity"], ["ai-infrastructure", "xstocks", "public-equity"], ["consumer-frontiers", "xstocks", "public-equity"],
      ["crypto-fintech-rails", "xstocks", "public-equity"], ["cloud-software", "xstocks", "public-equity"], ["everyday-brands", "xstocks", "public-equity"], ["index-basics", "xstocks", "public-equity"],
      ["frontier-ai-labs", "prestocks", "pre-ipo"], ["prediction-markets", "prestocks", "pre-ipo"], ["defense-space", "prestocks", "pre-ipo"],
      ["pelosi-tracker", "xstocks", "public-equity"], ["congress-consensus", "xstocks", "public-equity"]]);
    expect(bags.map((bag) => bag.curator.kind)).toEqual([...Array<string>(10).fill("editorial"), "person", "aggregate"]);
    for (const bag of bags.filter((item) => item.sourceType === "disclosure")) {
      expect(bag.tradable).toBe(false);
      expect(bag.tradableReason).toBeTruthy();
      expect(bag.disclosure).toMatch(/30-45 days/);
      expect(bag.risks.join(" ")).toMatch(/spouse/);
      expect(bag.market).toBeNull();
    }
    for (const bag of bags.filter((item) => item.sourceType === "editorial")) {
      expect(bag.tradable).toBe(false);
      expect(bag.tradableReason).toBe("One or more assets have no verified mint");
      expect(bag.market).toBeNull();
      expect(bag.risks.length).toBeGreaterThanOrEqual(4);
      expect(bag.disclosure).toContain("not investment advice");
      expect(bag.sources.every((source) => source.url.startsWith("https://"))).toBe(true);
      expect(bag.assets.reduce((sum, asset) => sum + asset.weightBps, 0)).toBe(10000);
      expect(bag.assets.every((asset) => asset.mint === null && asset.decimals === null && asset.uiAmountMultiplier === 1 && asset.issuer === bag.issuer && asset.assetClass === bag.assetClass)).toBe(true);
      if (bag.issuer === "xstocks") expect(bag.assets.every((asset) => asset.iconUrl?.startsWith("https://") && ["jupiter-token", "issuer-token"].includes(asset.iconSource ?? "") && asset.reference === null)).toBe(true);
      else {
        expect(bag.disclosure).toContain("not available in the U.S., to U.S. persons");
        expect(bag.risks.join(" ")).toMatch(/SPV/);
        expect(bag.sources.some((source) => source.url.startsWith("https://prestocks.com/"))).toBe(true);
        expect(bag.assets.every((asset) => asset.iconUrl === null && asset.reference === null)).toBe(true);
      }
    }
  });
  it("marks a bag tradable only when every asset symbol is on the operator allowlist", async () => {
    seedMints(`MSFTx:${verified.MSFTx},GOOGLx:${verified.GOOGLx},AMZNx:${verified.AMZNx},PLTRx:${verified.PLTRx}`);
    let { bag } = await (await app.request("/bags/cloud-software")).json() as { bag: Bag };
    expect(bag.tradable).toBe(false);
    expect(bag.assets.map((asset) => asset.mint)).toEqual([verified.MSFTx, verified.GOOGLx, verified.AMZNx, verified.PLTRx, null]);
    seedMints(Object.entries(verified).map(([symbol, mint]) => `${symbol}:${mint}`).join(","));
    ({ bag } = await (await app.request("/bags/cloud-software")).json() as { bag: Bag });
    expect(bag.tradable).toBe(true);
    expect(bag.assets.map((asset) => asset.mint)).toEqual(Object.values(verified));
    const { bags } = await (await app.request("/bags")).json() as { bags: Bag[] };
    expect(bags.map((item) => [item.id, item.tradable])).toEqual(bags.map((item) => [item.id, item.id === "cloud-software"]));
  });
  it("does not claim a nonexistent bag exists", async () => {
    expect((await app.request("/bags/unknown")).status).toBe(404);
    expect((await app.request("/bags/unknown/chart")).status).toBe(404);
    expect((await app.request("/baskets")).status).toBe(404);
  });
  it("fails soft on chart endpoints without a tokens.xyz key (200, empty points, typed reason) and rejects unknown ranges", async () => {
    const chart = await app.request("/bags/megacap-builders/chart?range=1W");
    expect(chart.status).toBe(200);
    expect(await chart.json()).toMatchObject({ bagId: "megacap-builders", range: "1W", interval: "1H", points: [], change: null, source: "tokens.xyz", reason: expect.stringMatching(/^(unconfigured|not_tradable)$/) });
    const sparklines = await app.request("/bags/sparklines");
    expect(sparklines.status).toBe(200);
    expect(await sparklines.json()).toMatchObject({ range: "1D", interval: "1H", reason: "unconfigured", sparklines: { "megacap-builders": [], "pelosi-tracker": [] } });
    expect((await app.request("/bags/megacap-builders/chart?range=7d")).status).toBe(400);
    expect(await (await app.request("/bags/megacap-builders/chart?range=1Y")).json()).toMatchObject({ range: "1Y", interval: "1D", points: [], reason: expect.stringMatching(/^(unconfigured|not_tradable)$/) });
    const returns = await app.request("/bags/returns");
    expect(returns.status).toBe(200);
    expect(await returns.json()).toMatchObject({ source: "tokens.xyz", interval: "1D", asOf: null, reason: "unconfigured", returns: { "megacap-builders": { "1M": null, "1Y": null, ALL: null, since: null, sparkline1M: [] }, "index-basics": { ALL: null } } });
    expect((await app.request(`/assets/${"1".repeat(32)}/chart`)).status).toBe(404); // not an allowlisted asset
    expect((await app.request("/assets/not-a-mint/chart")).status).toBe(400);
  });
  it("serves the Stockpile OpenAPI document without authentication", async () => {
    const response = await app.request("/openapi.json");
    expect(response.status).toBe(200);
    const document = await response.json() as { info: { title: string }; paths: Record<string, { get?: { operationId: string }; post?: { operationId: string } }> };
    expect(document.info.title).toBe("Stockpile API");
    expect(Object.keys(document.paths).sort()).toEqual(["/activity", "/assets/{mint}/chart", "/bags", "/bags/returns", "/bags/sparklines", "/bags/{id}", "/bags/{id}/chart", "/bags/{id}/history", "/bags/{id}/stories", "/health", "/me", "/portfolio", "/positions", "/positions/legs", "/saved-bags", "/saved-bags/{bagId}", "/stories", "/trade/prepare", "/trade/quote", "/trade/status", "/trade/submit"]);
    expect(document.paths["/bags"]?.get?.operationId).toBe("listBags");
    expect(document.paths["/trade/prepare"]?.post?.operationId).toBe("prepareBagTrade");
    expect(JSON.stringify(document).replace(/Stockpile/g, "")).not.toMatch(/basket|pile/i);
  });
  it("requires a Privy identity token for private endpoints", async () => {
    for (const route of ["/me", "/saved-bags", "/portfolio", "/activity", "/positions"]) {
      const response = await app.request(route);
      expect(response.status).toBe(401);
    }
    for (const route of ["/trade/prepare", "/positions/legs"]) expect((await app.request(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
  });
  it("refuses unconfigured Privy rather than accepting an unverified token", async () => {
    const previousApp = process.env.PRIVY_APP_ID;
    const previousSecret = process.env.PRIVY_APP_SECRET;
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_APP_SECRET;
    try {
      const response = await app.request("/me", { headers: { "privy-id-token": "arbitrary" } });
      expect(response.status).toBe(503);
    } finally {
      if (previousApp !== undefined) process.env.PRIVY_APP_ID = previousApp;
      if (previousSecret !== undefined) process.env.PRIVY_APP_SECRET = previousSecret;
    }
  });
});
