import { afterEach, expect, it } from "bun:test";
import { issuerAsset } from "./issuer-assets";
import { bags, configuredMint, configuredSymbol, isTradable } from "./bags";

const xstockBags = bags.filter((bag) => bag.issuer === "xstocks");

const previous = process.env.STOCKPILE_ALLOWED_MINTS;
afterEach(() => { if (previous === undefined) delete process.env.STOCKPILE_ALLOWED_MINTS; else process.env.STOCKPILE_ALLOWED_MINTS = previous; });

it("maps only catalogued symbols to exact issuer Solana mints for image lookup", async () => {
  for (const symbol of new Set(xstockBags.flatMap((bag) => bag.assets.map((asset) => asset.symbol)))) {
    const asset = issuerAsset(symbol);
    expect(asset?.mint).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(asset?.decimals).toBe(8);
    expect(asset?.logoUrl).toBe(`https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`);
  }
  expect(issuerAsset("unknown")).toBeNull();
  delete process.env.STOCKPILE_ALLOWED_MINTS;
  expect(configuredMint("AAPLx")).toBeNull();
  for (const bag of xstockBags) expect(await isTradable(bag)).toBe(false);
});

it("reads the allowlist strictly: exact symbol, base58 mint, every asset required for tradability", async () => {
  process.env.STOCKPILE_ALLOWED_MINTS = " AAPLx:22222222222222222222222222222222 ,MSFTx:not-a-mint,NVDAx:44444444444444444444444444444444,NVDA:55555555555555555555555555555555";
  expect(configuredMint("AAPLx")).toBe("22222222222222222222222222222222");
  expect(configuredMint("MSFTx")).toBeNull();
  expect(configuredMint("NVDAx")).toBe("44444444444444444444444444444444");
  expect(configuredSymbol("44444444444444444444444444444444")).toBe("NVDAx");
  expect(configuredSymbol("55555555555555555555555555555555")).toBeNull();
  expect(await isTradable(bags[0]!)).toBe(false);
  process.env.STOCKPILE_ALLOWED_MINTS = "AAPLx:22222222222222222222222222222222,MSFTx:33333333333333333333333333333333,NVDAx:44444444444444444444444444444444";
  expect(await isTradable(bags[0]!)).toBe(true);
  expect(await isTradable(bags[1]!)).toBe(false);
});

it("allowlist example documents exactly the xStocks snapshot mints plus PreStocks mints for pre-IPO bag symbols", async () => {
  const example = await Bun.file(new URL("../../../../.env.example", import.meta.url)).text();
  const line = example.split("\n").find((item) => item.startsWith("STOCKPILE_ALLOWED_MINTS="))!;
  const preIpo = new Set(bags.filter((bag) => bag.issuer === "prestocks").flatMap((bag) => bag.assets.map((asset) => asset.symbol)));
  for (const [symbol, mint] of line.slice("STOCKPILE_ALLOWED_MINTS=".length).split(",").map((item) => item.split(":"))) {
    if (preIpo.has(symbol!)) expect(mint).toMatch(/^Pre[1-9A-HJ-NP-Za-km-z]{29,41}$/);
    else expect(issuerAsset(symbol!)?.mint).toBe(mint!);
  }
});
