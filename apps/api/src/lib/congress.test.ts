import { describe, expect, it } from "bun:test";
import { congressConsensus, disclosureStory, formatUsdRange, parseDisclosure, pelosiTracker, toTrackerAssets, type Disclosure } from "./congress";

const now = new Date("2026-09-25T00:00:00Z");
const row = (extra: Record<string, unknown> = {}) => ({ member: "Nancy Pelosi", chamber: "House", trade_type: "buy", amount: "$500,001 -\n$1,000,000", tx_date: "2026-01-16", disclosed: "2026-01-23", asset: "Alphabet Inc. - Class A (GOOGL) [ST]", ticker: "GOOGL", link: "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20033725.pdf", ...extra });
const make = (extra: Record<string, unknown> = {}): Disclosure => parseDisclosure(row(extra))!;

describe("parseDisclosure", () => {
  it("normalises whitespace in ranges, parses amounts and keeps only official filing hosts and tracked tickers", () => {
    const item = parseDisclosure(row());
    expect(item).toMatchObject({ member: "Nancy Pelosi", chamber: "House", ticker: "GOOGL", txnType: "buy", amountRange: "$500,001 - $1,000,000", amountLow: 500001, amountHigh: 1000000 });
    expect(item?.txnDate.toISOString()).toBe("2026-01-16T00:00:00.000Z");
    expect(item?.id).toHaveLength(32);
    expect(parseDisclosure(row({ trade_type: "sell_partial" }))?.txnType).toBe("sell");
    expect(parseDisclosure(row({ chamber: "Senate", link: "https://efdsearch.senate.gov/search/view/ptr/abc/" }))?.chamber).toBe("Senate");
    expect(parseDisclosure(row({ ticker: "SONY" }))).toBeNull();
    expect(parseDisclosure(row({ link: "https://evil.example/ptr.pdf" }))).toBeNull();
    expect(parseDisclosure(row({ link: "http://disclosures-clerk.house.gov/x.pdf" }))).toBeNull();
    expect(parseDisclosure(row({ tx_date: "2026-12-26" }))).toBeNull(); // future transaction date (seen live)
    expect(parseDisclosure(row({ amount: "over $50,000,000" }))).toBeNull();
    expect(parseDisclosure(row({ trade_type: "gift" }))).toBeNull();
    expect(parseDisclosure(null)).toBeNull();
  });
});

describe("tracker bags", () => {
  it("Pelosi tracker keeps only her purchases disclosed in the last 12 months and weights by range midpoint", () => {
    const rows = [
      make(),
      make({ ticker: "NVDA", amount: "$1,000,001 - $5,000,000", tx_date: "2026-03-02", disclosed: "2026-03-20" }),
      make({ ticker: "AAPL", trade_type: "sell", amount: "$5,000,001 - $25,000,000" }),
      make({ ticker: "MSFT", disclosed: "2025-06-01", tx_date: "2025-05-20" }),
      make({ member: "Ro Khanna", ticker: "AMZN" }),
    ];
    const assets = pelosiTracker(rows, now);
    expect(assets.map((asset) => [asset.ticker, asset.symbol, asset.weightBps])).toEqual([["NVDA", "NVDAx", 8000], ["GOOGL", "GOOGLx", 2000]]);
    expect(assets.reduce((sum, asset) => sum + asset.weightBps, 0)).toBe(10000);
    expect(assets[1]?.evidence).toEqual([{ kind: "disclosure", member: "Nancy Pelosi", chamber: "House", txnType: "buy", txnDate: "2026-01-16", disclosedDate: "2026-01-23", amountRange: "$500,001 - $1,000,000", amountMidUsd: 750000.5, url: "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20033725.pdf" }]);
    expect(pelosiTracker([make({ trade_type: "sell" })], now)).toEqual([]);
  });
  it("Congress consensus nets buys minus sells over 90 days of transaction dates across all members", () => {
    const rows = [
      make({ member: "A", ticker: "GOOGL", tx_date: "2026-09-01", amount: "$15,001 - $50,000" }),
      make({ member: "B", ticker: "GOOGL", tx_date: "2026-08-15", trade_type: "sell", amount: "$1,001 - $15,000" }),
      make({ member: "C", ticker: "AMD", tx_date: "2026-08-20", amount: "$1,001 - $15,000" }),
      make({ member: "D", ticker: "NVDA", tx_date: "2026-08-20", trade_type: "sell", amount: "$100,001 - $250,000" }),
      make({ member: "E", ticker: "TSLA", tx_date: "2026-05-01", amount: "$1,000,001 - $5,000,000" }), // outside 90d
      make({ member: "F", ticker: "AMZN", tx_date: "2026-09-10", trade_type: "exchange", amount: "$1,000,001 - $5,000,000" }),
    ];
    const assets = congressConsensus(rows, now);
    expect(assets.map((asset) => [asset.ticker, asset.netUsd, asset.weightBps])).toEqual([["GOOGL", 32500.5 - 8000.5, 7538], ["AMD", 8000.5, 2462]]);
    expect(assets[0]?.evidence).toHaveLength(2);
    expect(congressConsensus([make({ trade_type: "sell", tx_date: "2026-09-01" })], now)).toEqual([]);
  });
  it("normalises weights to exactly 10000 with the smallest leg absorbing rounding", () => {
    const assets = toTrackerAssets(new Map([["AAPL", { net: 1, evidence: [] }], ["MSFT", { net: 1, evidence: [] }], ["NVDA", { net: 1, evidence: [] }], ["AMD", { net: -5, evidence: [] }]]));
    expect(assets.map((asset) => asset.weightBps)).toEqual([3333, 3333, 3334]);
    expect(toTrackerAssets(new Map())).toEqual([]);
  });
});

describe("disclosure stories", () => {
  it("builds a reel per filing with the official filing as source and links tracker bags", () => {
    const story = disclosureStory(make());
    expect(story).toMatchObject({ format: "disclosure", title: "Pelosi disclosed buying GOOGL (range $500K–$1M)", publisher: "House Clerk PTR", provenance: "editorial", status: "published", imageUrl: null });
    expect(story.canonicalUrl).toStartWith("https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20033725.pdf#");
    expect(story.publishedAt.toISOString()).toBe("2026-01-23T00:00:00.000Z");
    expect(story.connections.map((c) => [c.bagId, c.context])).toEqual([["congress-consensus", "supporting"], ["pelosi-tracker", "supporting"]]);
    expect(story.summary).toContain("ranges, not exact values");
    const sell = disclosureStory(make({ member: "John J Mr McGuire", trade_type: "sell", amount: "$1,001 - $15,000", chamber: "Senate", link: "https://efdsearch.senate.gov/search/view/ptr/abc/" }));
    expect(sell.title).toBe("McGuire disclosed selling GOOGL (range $1K–$15K)");
    expect(sell.connections.map((c) => [c.bagId, c.context])).toEqual([["congress-consensus", "opposing"]]);
    expect(formatUsdRange(1000001, 5000000)).toBe("$1M–$5M");
  });
});
