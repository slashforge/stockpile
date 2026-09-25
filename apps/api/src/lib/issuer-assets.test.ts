import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { issuerAsset, pinnedMint } from "./issuer-assets";
import { bags, isTradable, knownSymbol, resolveAsset } from "./bags";
import { knownMint, resetMintRegistry, seedMints } from "./mint-registry";
import { resetPreStocksCache } from "./prestocks";
import { parseXStock, resetXStocksCache, XSTOCKS_API } from "./xstocks";

const xstockBags = bags.filter((bag) => bag.issuer === "xstocks");
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const ROGUE = "XsRogue1111111111111111111111111111111111111";
const keys = ["JUPITER_API_KEY", "STOCKPILE_XSTOCKS", "STOCKPILE_BLOCKED_MINTS", "STOCKPILE_MARKET"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetMintRegistry(); resetXStocksCache(); resetPreStocksCache();
  process.env.STOCKPILE_XSTOCKS = "0"; process.env.STOCKPILE_MARKET = "0"; delete process.env.STOCKPILE_BLOCKED_MINTS; delete process.env.JUPITER_API_KEY;
});
afterEach(() => {
  globalThis.fetch = originalFetch; resetMintRegistry(); resetXStocksCache(); resetPreStocksCache();
  for (const key of keys) { const value = original[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

const listing = (symbol: string, mint: string) => ({ symbol, name: "Apple xStock", logo: `https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`,
  deployments: [{ network: "Solana", address: mint }, { network: "Arbitrum", address: "0x19b7680118fd54b8d52ef922afb3bbb13e3ad47f" }] });
/** Mocks the xStocks per-symbol API and Jupiter search/quote/price. `listed` maps symbol -> mint (missing => 404). */
function providers(listed: Record<string, string>, options: { tags?: string[] } = {}) {
  const calls: string[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    if (url.href.startsWith(`${XSTOCKS_API}/`)) {
      const symbol = decodeURIComponent(url.pathname.split("/").pop()!);
      return listed[symbol] ? Response.json(listing(symbol, listed[symbol]!)) : new Response("", { status: 404 });
    }
    if (url.pathname === "/tokens/v2/search") {
      const mint = url.searchParams.get("query")!;
      const symbol = Object.entries(listed).find(([, value]) => value === mint)?.[0];
      return Response.json(symbol ? [{ id: mint, symbol, decimals: 8, tags: options.tags ?? ["xstocks", "verified", "token-2022"] }] : []);
    }
    if (url.pathname === "/swap/v1/quote") return Response.json({ inputMint: USDC, outputMint: url.searchParams.get("outputMint"), outAmount: "400" });
    if (url.pathname === "/price/v3") return Response.json({});
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;
  return calls;
}

it("maps only catalogued symbols to exact issuer Solana mints for icons and pins", () => {
  for (const symbol of new Set(xstockBags.flatMap((bag) => bag.assets.map((asset) => asset.symbol)))) {
    const asset = issuerAsset(symbol);
    expect(asset?.mint).toMatch(/^Xs[1-9A-HJ-NP-Za-km-z]{30,42}$/);
    expect(asset?.decimals).toBe(8);
    expect(asset?.logoUrl).toBe(`https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`);
    expect(pinnedMint(symbol)).toBe(asset!.mint);
  }
  for (const bag of bags.filter((item) => item.issuer === "prestocks")) for (const asset of bag.assets) expect(pinnedMint(asset.symbol)).toMatch(/^Pre[1-9A-HJ-NP-Za-km-z]{29,41}$/);
  expect(issuerAsset("unknown")).toBeNull();
  expect(pinnedMint("unknown")).toBeNull();
});

it("keeps every editorial xStocks bag internally consistent: 5-8 assets (3 for the ETF bag), issuer snapshot entry per symbol, weights summing to 10000, no duplicates", () => {
  const editorial = xstockBags.filter((bag) => !bag.tracker);
  expect(editorial.map((bag) => bag.id)).toEqual(["megacap-builders", "ai-infrastructure", "consumer-frontiers", "crypto-fintech-rails", "cloud-software", "everyday-brands", "index-basics"]);
  const minAssets: Record<string, number> = { "index-basics": 3 };
  for (const bag of editorial) {
    expect(bag.assets.length).toBeGreaterThanOrEqual(minAssets[bag.id] ?? 5);
    expect(bag.assets.length).toBeLessThanOrEqual(8);
    expect(bag.assets.reduce((sum, asset) => sum + asset.weightBps, 0)).toBe(10000);
    expect(new Set(bag.assets.map((asset) => asset.symbol)).size).toBe(bag.assets.length);
    expect(bag.sources.length).toBeGreaterThanOrEqual(2);
    for (const asset of bag.assets) {
      expect(asset.weightBps).toBeGreaterThan(0);
      expect(asset.symbol).toBe(`${asset.underlyingTicker}x`);
      expect(asset.name).toMatch(/ xStock$/);
    }
  }
});

it("parses only a single, well-formed Solana deployment for the requested symbol", () => {
  expect(parseXStock(listing("AAPLx", AAPLX), "AAPLx")).toEqual({ symbol: "AAPLx", mint: AAPLX, name: "Apple xStock", logoUrl: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png" });
  expect(parseXStock(listing("AAPLx", AAPLX), "MSFTx")).toBeNull();
  expect(parseXStock(listing("AAPLx", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), "AAPLx")).toBeNull(); // not an xStocks mint
  expect(parseXStock({ ...listing("AAPLx", AAPLX), deployments: [{ network: "Solana", address: AAPLX }, { network: "Solana", address: ROGUE }] }, "AAPLx")).toBeNull();
  expect(parseXStock({ ...listing("AAPLx", AAPLX), logo: "https://evil.example/x.png" }, "AAPLx")?.logoUrl).toBeNull();
});

it("resolves xStocks mints live from the issuer and Jupiter with no per-token configuration", async () => {
  process.env.STOCKPILE_XSTOCKS = "1"; process.env.JUPITER_API_KEY = "test";
  const bag = bags[0]!;
  const apple = bag.assets.find((asset) => asset.symbol === "AAPLx")!;
  const calls = providers({ AAPLx: AAPLX });
  expect(await resolveAsset(bag, apple)).toMatchObject({ mint: AAPLX, decimals: 8, uiAmountMultiplier: 1, issuer: "xstocks", issuerIconUrl: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png" });
  expect(knownSymbol(AAPLX)).toBe("AAPLx");
  // Cached: a second resolution makes no network calls.
  const before = calls.length;
  await resolveAsset(bag, apple);
  expect(calls.length).toBe(before);
  // A symbol with no pin (new listing) resolves too, as long as Jupiter agrees.
  const newcomer = { ...apple, symbol: "NEWCOx", underlyingTicker: "NEWCO", name: "Newco xStock" };
  providers({ NEWCOx: ROGUE });
  expect((await resolveAsset(bag, newcomer)).mint).toBe(ROGUE);
  // Unlisted (404) stays research-only.
  expect((await resolveAsset(bag, bag.assets.find((asset) => asset.symbol === "MSFTx")!)).mint).toBeNull();
});

it("refuses a directory that swaps a pinned mint, mints Jupiter does not tag as xStocks, and operator-blocked mints", async () => {
  process.env.STOCKPILE_XSTOCKS = "1"; process.env.JUPITER_API_KEY = "test";
  const bag = bags[0]!;
  const apple = bag.assets.find((asset) => asset.symbol === "AAPLx")!;
  providers({ AAPLx: ROGUE });
  expect((await resolveAsset(bag, apple)).mint).toBeNull();
  resetXStocksCache(); resetPreStocksCache();
  providers({ AAPLx: AAPLX }, { tags: ["verified"] });
  expect((await resolveAsset(bag, apple)).mint).toBeNull();
  resetXStocksCache(); resetPreStocksCache();
  providers({ AAPLx: AAPLX });
  process.env.STOCKPILE_BLOCKED_MINTS = `  ${AAPLX} `;
  expect((await resolveAsset(bag, apple)).mint).toBeNull();
  expect(knownMint("AAPLx")).toBeNull();
  process.env.STOCKPILE_BLOCKED_MINTS = "AAPLx";
  expect((await resolveAsset(bag, apple)).mint).toBeNull();
  delete process.env.STOCKPILE_BLOCKED_MINTS;
  expect((await resolveAsset(bag, apple)).mint).toBe(AAPLX);
});

it("is research-only when the directory is disabled or unreachable, and every asset must resolve for tradability", async () => {
  for (const bag of xstockBags) expect(await isTradable(bag)).toBe(false);
  expect(knownMint("AAPLx")).toBe(AAPLX); // pins still label holdings without network
  seedMints(" AAPLx:22222222222222222222222222222222 ,MSFTx:not-a-mint,NVDAx:44444444444444444444444444444444");
  expect(knownMint("AAPLx")).toBe("22222222222222222222222222222222");
  expect(knownSymbol("44444444444444444444444444444444")).toBe("NVDAx");
  const trio = { ...bags[0]!, assets: bags[0]!.assets.filter((asset) => ["AAPLx", "MSFTx", "NVDAx"].includes(asset.symbol)) };
  expect(await isTradable(trio)).toBe(false);
  seedMints("AAPLx:22222222222222222222222222222222,MSFTx:33333333333333333333333333333333,NVDAx:44444444444444444444444444444444");
  expect(await isTradable(trio)).toBe(true);
  expect(await isTradable(bags[0]!)).toBe(false);
});

it("documents no per-token mint list in the env example", async () => {
  const example = await Bun.file(new URL("../../../../.env.example", import.meta.url)).text();
  expect(example).not.toContain("STOCKPILE_ALLOWED_MINTS=");
  expect(example).toContain("STOCKPILE_BLOCKED_MINTS=");
});
