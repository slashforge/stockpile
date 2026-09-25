import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "./app";

const original = process.env.STOCKPILE_ALLOWED_MINTS;
const originalPrestocks = process.env.STOCKPILE_PRESTOCKS;
const verified = { AAPLx: "22222222222222222222222222222222", MSFTx: "33333333333333333333333333333333", NVDAx: "44444444444444444444444444444444" };
beforeEach(() => { delete process.env.STOCKPILE_ALLOWED_MINTS; process.env.STOCKPILE_PRESTOCKS = "0"; });
afterEach(() => {
  if (original === undefined) delete process.env.STOCKPILE_ALLOWED_MINTS; else process.env.STOCKPILE_ALLOWED_MINTS = original;
  if (originalPrestocks === undefined) delete process.env.STOCKPILE_PRESTOCKS; else process.env.STOCKPILE_PRESTOCKS = originalPrestocks;
});

type Bag = { id: string; sourceType: string; issuer: string; assetClass: string; risks: string[]; disclosure: string; tradable: boolean; assets: { symbol: string; weightBps: number; mint: string | null; decimals: number | null; uiAmountMultiplier: number; issuer: string; assetClass: string; reference: unknown; iconUrl: string | null; iconSource: string | null }[]; sources: { url: string }[] };

describe("public bags and auth boundaries", () => {
  it("returns six source-backed editorial bags that are research-only without an allowlist or issuer directory", async () => {
    const response = await app.request("/bags");
    expect(response.status).toBe(200);
    const { bags } = await response.json() as { bags: Bag[] };
    expect(bags.map((bag) => [bag.id, bag.issuer, bag.assetClass])).toEqual([
      ["megacap-builders", "xstocks", "public-equity"], ["ai-infrastructure", "xstocks", "public-equity"], ["consumer-frontiers", "xstocks", "public-equity"],
      ["frontier-ai-labs", "prestocks", "pre-ipo"], ["prediction-markets", "prestocks", "pre-ipo"], ["defense-space", "prestocks", "pre-ipo"]]);
    for (const bag of bags) {
      expect(bag.sourceType).toBe("editorial");
      expect(bag.tradable).toBe(false);
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
    process.env.STOCKPILE_ALLOWED_MINTS = `AAPLx:${verified.AAPLx},MSFTx:${verified.MSFTx}`;
    let { bag } = await (await app.request("/bags/megacap-builders")).json() as { bag: Bag };
    expect(bag.tradable).toBe(false);
    expect(bag.assets.map((asset) => asset.mint)).toEqual([verified.AAPLx, verified.MSFTx, null]);
    process.env.STOCKPILE_ALLOWED_MINTS = Object.entries(verified).map(([symbol, mint]) => `${symbol}:${mint}`).join(",");
    ({ bag } = await (await app.request("/bags/megacap-builders")).json() as { bag: Bag });
    expect(bag.tradable).toBe(true);
    expect(bag.assets.map((asset) => asset.mint)).toEqual(Object.values(verified));
    const { bags } = await (await app.request("/bags")).json() as { bags: Bag[] };
    expect(bags.map((item) => item.tradable)).toEqual([true, false, false, false, false, false]);
  });
  it("does not claim a nonexistent bag exists", async () => {
    expect((await app.request("/bags/unknown")).status).toBe(404);
    expect((await app.request("/baskets")).status).toBe(404);
  });
  it("serves the Stockpile OpenAPI document without authentication", async () => {
    const response = await app.request("/openapi.json");
    expect(response.status).toBe(200);
    const document = await response.json() as { info: { title: string }; paths: Record<string, { get?: { operationId: string }; post?: { operationId: string } }> };
    expect(document.info.title).toBe("Stockpile API");
    expect(Object.keys(document.paths).sort()).toEqual(["/bags", "/bags/{id}", "/bags/{id}/stories", "/health", "/me", "/portfolio", "/saved-bags", "/saved-bags/{bagId}", "/stories", "/trade/prepare", "/trade/quote"]);
    expect(document.paths["/bags"]?.get?.operationId).toBe("listBags");
    expect(document.paths["/trade/prepare"]?.post?.operationId).toBe("prepareBagTrade");
    expect(JSON.stringify(document).replace(/Stockpile/g, "")).not.toMatch(/basket|pile/i);
  });
  it("requires a Privy identity token for private endpoints", async () => {
    for (const route of ["/me", "/saved-bags", "/portfolio"]) {
      const response = await app.request(route);
      expect(response.status).toBe(401);
    }
    expect((await app.request("/trade/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
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
