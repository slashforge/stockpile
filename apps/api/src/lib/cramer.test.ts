import { describe, expect, it } from "bun:test";
import { articleUrl, cramerExclusions, cramerUniverse, extractArticle, inverseCramer, pageMeta, parseMadMoneyFeed, universeTicker, validateCalls, type CramerCall } from "./cramer";
import { pinnedXStocks } from "./issuer-assets";

const now = new Date("2026-10-17T00:00:00Z");
const call = (ticker: string, stance: CramerCall["stance"], day: string, extra: Partial<CramerCall> = {}): CramerCall => ({
  id: `${ticker}-${day}-${stance}`, articleUrl: `https://www.cnbc.com/2026/${day.slice(5, 7)}/${day.slice(8)}/cramer-${ticker.toLowerCase()}.html`, ticker, stance,
  saidAt: new Date(`${day}T22:55:00Z`), title: `Cramer on ${ticker}`, quote: `Quote about ${ticker}`, model: "gpt-6-luna", ...extra,
});

describe("universe", () => {
  it("covers every pinned single-stock xStock (ETFs and probe failures excluded) and maps CNBC aliases", () => {
    const pinned = pinnedXStocks().map(([symbol]) => symbol.slice(0, -1)).filter((ticker) => !["SPY", "QQQ", "GLD", "MU", "BAC"].includes(ticker)).sort();
    expect(Object.keys(cramerUniverse).sort()).toEqual(pinned);
    expect(universeTicker("GOOG")).toBe("GOOGL");
    expect(universeTicker("BRK.A")).toBe("BRK.B");
    expect(universeTicker("RDDT")).toBeNull();
    expect(universeTicker("constructor")).toBeNull();
  });
});

describe("CNBC parsing", () => {
  it("accepts only canonical cnbc.com article URLs", () => {
    expect(articleUrl("https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html?utm_source=x#top")).toBe("https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html");
    for (const bad of ["http://www.cnbc.com/2026/10/15/a-b.html", "https://cnbc.com.evil.example/2026/10/15/a-b.html", "https://www.cnbc.com/video/2026/10/15/a-b.html",
      "https://www.cnbc.com/investingclub/2026/10/15/a-b.html", "not a url"]) expect(articleUrl(bad)).toBeNull();
  });
  it("reads Mad Money RSS items and drops videos, bad dates and future items", () => {
    const item = (link: string, title: string, date: string) => `<item><link>${link}</link><title>${title}</title><pubDate>${date}</pubDate></item>`;
    const xml = `<?xml version="1.0"?><rss><channel>${item("https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html", "Cramer&apos;s lightning round: Buy Reddit", "Thu, 15 Oct 2026 22:55:01 GMT")}${
      item("https://www.cnbc.com/video/2026/10/15/clip.html", "A video clip title", "Thu, 15 Oct 2026 22:00:00 GMT")}${
      item("https://www.cnbc.com/2026/10/14/cramer-banks.html", "Cramer on bank earnings", "not a date")}${
      item("https://www.cnbc.com/2026/10/20/cramer-future.html", "Cramer from the future", "Tue, 20 Oct 2026 22:00:00 GMT")}</channel></rss>`;
    expect(parseMadMoneyFeed(xml, now.getTime())).toEqual([{ url: "https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html", title: "Cramer's lightning round: Buy Reddit", publishedAt: new Date("2026-10-15T22:55:01Z") }]);
    expect(() => parseMadMoneyFeed("<!DOCTYPE x [<!ENTITY a 'b'>]><rss/>")).toThrow();
  });
  it("extracts body paragraphs and tradable tickers up to the boilerplate footer", () => {
    const quote = (ticker: string, name: string) => `<a href="/quotes/${ticker}/">${name}</a><span class="QuoteInBody-inlineButton"><span class="AddToWatchlistButton-watchlistContainer"><button aria-label="Add To Watchlist"></button></span></span>`;
    const html = `<style>.ArticleBody-articleBody{margin:0}</style><p>Navigation paragraph that must be ignored entirely.</p>
      <div class="ArticleBody-articleBody" data-module="ArticleBody"><ul><li>${quote("TSLA", "Tesla")}</li></ul>
      <p>${quote("TSLA", "Tesla")}: &quot;I&#x27;m not recommending it here. Take some off the table.&quot;</p>
      <p>${quote("GOOG", "Alphabet")} and ${quote("RDDT", "Reddit")}: &ldquo;I like them both.&rdquo;</p><p>Short.</p><p>Disclaimer</p>
      <p>Click here to read Jim Cramer's Guide to Investing at no cost.</p><p>${quote("NVDA", "Nvidia")} is in the footer and must be ignored.</p></div>`;
    expect(extractArticle(html)).toEqual({
      paragraphs: ["Tesla: \"I'm not recommending it here. Take some off the table.\"", "Alphabet and Reddit: \u201cI like them both.\u201d"],
      tickers: ["TSLA", "GOOGL"],
    });
    expect(extractArticle("<p>No article body here at all.</p>")).toEqual({ paragraphs: [], tickers: [] });
  });
  it("reads title and publish time from article meta tags", () => {
    expect(pageMeta(`<meta property="og:title" content="Cramer&#x27;s lightning round: Buy Reddit"/><meta property="article:published_time" content="2026-10-15T22:55:01+0000"/>`))
      .toEqual({ title: "Cramer's lightning round: Buy Reddit", publishedAt: new Date("2026-10-15T22:55:01Z") });
    expect(pageMeta("<title>x</title>")).toBeNull();
  });
});

describe("validateCalls", () => {
  const extracted = { paragraphs: ["Tesla: \u201cI\u2019m not recommending it here.\u201d", "Alphabet and Reddit: I like them both."], tickers: ["TSLA", "GOOGL"] };
  it("keeps verbatim quotes (curly quotes may come back straight) and returns the article's own characters", () => {
    expect(validateCalls({ calls: [{ ticker: "TSLA", stance: "bearish", quote: "\"I'm not recommending it here.\"" }, { ticker: "GOOGL", stance: "bullish", quote: "I like  them both." }] }, extracted))
      .toEqual([{ ticker: "TSLA", stance: "bearish", quote: "\u201cI\u2019m not recommending it here.\u201d" }, { ticker: "GOOGL", stance: "bullish", quote: "I like them both." }]);
  });
  it("drops calls whose quote is not in a single paragraph, empty or too long", () => {
    expect(validateCalls({ calls: [{ ticker: "TSLA", stance: "bearish", quote: "Tesla is a sell" }, { ticker: "GOOGL", stance: "neutral", quote: "" }] }, extracted)).toEqual([]);
    expect(validateCalls({ calls: [{ ticker: "TSLA", stance: "bearish", quote: "x".repeat(300) }] }, extracted)).toEqual([]);
  });
  it("rejects the whole output for unsupplied or duplicate tickers, or a malformed shape", () => {
    expect(validateCalls({ calls: [{ ticker: "RDDT", stance: "bullish", quote: "I like them both." }] }, extracted)).toBeNull();
    expect(validateCalls({ calls: [{ ticker: "GOOGL", stance: "bullish", quote: "I like them both." }, { ticker: "GOOGL", stance: "bearish", quote: "I like them both." }] }, extracted)).toBeNull();
    expect(validateCalls({ calls: [{ ticker: "TSLA", stance: "sell", quote: "I like them both." }] }, extracted)).toBeNull();
    expect(validateCalls("nope", extracted)).toBeNull();
  });
});

describe("inverseCramer", () => {
  it("excludes net-bullish names, puts net-bearish names first, fills by size and weights by 1 + score", () => {
    const calls = [
      call("PG", "bearish", "2026-10-01"), call("PG", "bearish", "2026-10-08"),
      call("TSLA", "bearish", "2026-09-20"),
      call("PEP", "bearish", "2026-09-28"), call("PEP", "bullish", "2026-10-08"),
      call("NVDA", "bullish", "2026-10-05"), call("MSFT", "bullish", "2026-10-06"), call("AAPL", "neutral", "2026-10-06"),
      call("GOOGL", "bearish", "2026-07-01"), // outside the 60-day window
    ];
    const assets = inverseCramer(calls, now);
    expect(assets.map((asset) => [asset.symbol, asset.netCalls, asset.weightBps])).toEqual([
      ["PGx", 2, 2727], ["TSLAx", 1, 1818], ["AAPLx", 0, 909], ["GOOGLx", 0, 909], ["AMZNx", 0, 909], ["METAx", 0, 909], ["AVGOx", 0, 909], ["TSMx", 0, 910]]);
    expect(assets[0]).toMatchObject({ name: "Procter & Gamble xStock", sourceUrl: "https://www.cnbc.com/2026/10/08/cramer-pg.html" });
    expect(assets[0]!.evidence.map((item) => [item.kind, item.stance, item.saidAt])).toEqual([["call", "bearish", "2026-10-08"], ["call", "bearish", "2026-10-01"]]);
    expect(assets[2]).toMatchObject({ evidence: [], sourceUrl: "https://www.cnbc.com/mad-money/" });
    expect(cramerExclusions(calls, now)).toEqual(["NVDA", "MSFT"]);
  });
  it("breaks ties between bearish names by the most recent bearish call and caps the bag at eight", () => {
    const calls = ["COIN", "HOOD", "MSTR", "CRCL", "INTC", "PEP", "MCD", "PG", "KO"].map((ticker, index) => call(ticker, "bearish", `2026-10-${String(index + 1).padStart(2, "0")}`));
    expect(inverseCramer(calls, now).map((asset) => asset.ticker)).toEqual(["KO", "PG", "MCD", "PEP", "INTC", "CRCL", "MSTR", "HOOD"]);
  });
  it("lets thin pools in only on a bearish call, never as filler", () => {
    const hyped = ["NVDA", "MSFT", "AAPL", "GOOGL", "AMZN", "META", "AVGO", "TSLA", "TSM", "SPCX", "BRK.B"].map((ticker) => call(ticker, "bullish", "2026-10-05"));
    expect(inverseCramer([...hyped, call("COIN", "bearish", "2026-10-06")], now).map((asset) => asset.ticker)).toEqual(["COIN", "PLTR", "KO", "MCD", "INTC", "HOOD", "MSTR", "CRCL"]);
  });
  it("is empty until a non-neutral call is on record, so an empty table never looks like a signal", () => {
    expect(inverseCramer([], now)).toEqual([]);
    expect(inverseCramer([call("AAPL", "neutral", "2026-10-06"), call("ZZZZ", "bearish", "2026-10-06")], now)).toEqual([]);
  });
});
