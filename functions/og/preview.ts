// Writes sample cards to disk for design review (fixture data, logos fetched from the issuers).
// Usage: bun functions/og/preview.ts [outDir=/tmp/newsbid-og]
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AssetCard, BagCard, bagGradient, HomeCard, PageCard } from "./cards";
import { cardAssets, inlineIcon } from "./data";
import { renderPng } from "./render";

const out = process.argv[2] ?? "/tmp/newsbid-og";
await mkdir(out, { recursive: true });

const logo = (symbol: string) => `https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`;
const x = (symbol: string, name: string, weightBps: number, brandColor: string) => ({ symbol, name, weightBps, brandColor, iconUrl: logo(symbol) });

const consumer = await cardAssets([
  x("AMZNx", "Amazon xStock", 2200, "#f89808"),
  x("TSLAx", "Tesla xStock", 2200, "#ef0027"),
  x("METAx", "Meta Platforms xStock", 1600, "#0866ff"),
  x("NFLXx", "Netflix xStock", 1200, "#b1060f"),
  x("MCDx", "McDonald's xStock", 1200, "#ffbc0d"),
  x("WMTx", "Walmart xStock", 800, "#0071ce"),
  x("HOODx", "Robinhood xStock", 800, "#00c805"),
]);
const ai = await cardAssets([
  x("NVDAx", "NVIDIA xStock", 2400, "#78b808"),
  x("MSFTx", "Microsoft xStock", 1400, "#fdb92c"),
  x("GOOGLx", "Alphabet xStock", 1200, "#f71603"),
  x("AMZNx", "Amazon xStock", 1000, "#f89808"),
  x("PLTRx", "Palantir xStock", 1000, "#101113"),
  x("AVGOx", "Broadcom xStock", 1000, "#cc092f"),
  x("AMDx", "AMD xStock", 1000, "#1a1a1a"),
  x("INTCx", "Intel xStock", 1000, "#0068b5"),
]);
const labs = await cardAssets([
  { symbol: "OPENAI", name: "OpenAI PreStocks", weightBps: 3500, brandColor: "#0ea982", iconUrl: "https://prestocks.com/logos/openai.png" },
  { symbol: "ANTHROPIC", name: "Anthropic PreStocks", weightBps: 3500, brandColor: "#ba8f70", iconUrl: "https://prestocks.com/logos/anthropic.png" },
  { symbol: "FIGUREAI", name: "Figure AI PreStocks", weightBps: 1500, brandColor: "#000000", iconUrl: "https://prestocks.com/logos/figureai.png" },
  { symbol: "NEURALINK", name: "Neuralink PreStocks", weightBps: 1500, brandColor: "#010101", iconUrl: "https://prestocks.com/logos/neuralink.png" },
]);
const wave = Array.from({ length: 30 }, (_, i) => 100 + i * 0.18 + Math.sin(i / 3) * 1.6);

const cards = {
  "landing-home": HomeCard({ url: "newsbid.trade", bag: { title: "Consumer Frontiers", assets: consumer } }),
  "web-app": HomeCard({
    url: "app.newsbid.trade",
    section: "Open the app",
    kicker: "Stories, bags, one slide",
    lead: "Read the story, look inside the bag, and buy the whole basket from your own wallet.",
    bag: { title: "AI Infrastructure", assets: ai },
  }),
  "landing-blog-post": PageCard({
    section: "The Journal",
    kicker: "Sep 25, 2026",
    title: "Introducing Newsbid",
    description: "A swipeable feed of real stories, each linked to a source-backed bag of tokenized stocks and pre-IPO tokens you can buy in one flow on Solana.",
    url: "newsbid.trade/blog/introducing-newsbid",
  }),
  "landing-legal": PageCard({
    section: "Legal",
    kicker: "Updated Sep 26, 2026",
    title: "Disclosures",
    description: "Risks of tokenized stocks and pre-IPO tokens, how bags are built, and what Newsbid does and does not do.",
    url: "newsbid.trade/disclosures",
  }),
  "bag-ai": BagCard({
    url: "app.newsbid.trade/bag/ai-infrastructure",
    title: "AI Infrastructure",
    subtitle: "Hardware, platforms, and compute",
    issuer: "xstocks",
    sourceType: "editorial",
    curator: "Newsbid Editorial",
    tradable: true,
    assets: ai,
    returns: { m1: 4.23, y1: 31.8, sparkline: wave },
    change24h: -0.62,
    gradient: bagGradient({ id: "ai-infrastructure", title: "AI Infrastructure", subtitle: "Hardware, platforms, and compute" }),
  }),
  "bag-labs-no-returns": BagCard({
    url: "app.newsbid.trade/bag/frontier-ai-labs",
    title: "Frontier AI Labs",
    subtitle: "Pre-IPO exposure to model, robotics, and neural-interface labs",
    issuer: "prestocks",
    sourceType: "editorial",
    curator: "Newsbid Editorial",
    tradable: true,
    assets: labs,
    returns: null,
    change24h: 1.4,
    gradient: bagGradient({ id: "frontier-ai-labs", title: "Frontier AI Labs", subtitle: "Pre-IPO" }),
  }),
  "bag-long-title": BagCard({
    url: "app.newsbid.trade/bag/crypto-fintech-rails",
    title: "Crypto & Fintech Rails",
    subtitle: "Exchanges, stablecoins, treasuries, and consumer fintech",
    issuer: "xstocks",
    sourceType: "editorial",
    curator: "Newsbid Editorial",
    tradable: true,
    assets: consumer.slice(0, 5),
    returns: { m1: -3.1, y1: null, sparkline: wave.map((v) => 200 - v) },
    change24h: 0.8,
    gradient: bagGradient({ id: "crypto-fintech-rails", title: "Crypto & Fintech Rails", subtitle: "fintech" }),
  }),
  "bag-tracker-research": BagCard({
    url: "app.newsbid.trade/bag/pelosi-tracker",
    title: "Pelosi Tracker",
    subtitle: "Purchases disclosed by Rep. Nancy Pelosi in the last 12 months",
    issuer: "xstocks",
    sourceType: "disclosure",
    curator: "Nancy Pelosi",
    tradable: false,
    assets: [],
    returns: null,
    change24h: null,
    gradient: bagGradient({ id: "pelosi-tracker", title: "Pelosi Tracker", subtitle: "" }),
  }),
  "asset-nvda": AssetCard({
    url: "app.newsbid.trade/asset/NVDAx",
    symbol: "NVDAx",
    company: "NVIDIA",
    issuer: "xstocks",
    underlying: "NVDA",
    icon: await inlineIcon(logo("NVDAx")),
    color: "#78b808",
    price: 187.42,
    change24h: 2.31,
    bags: [
      { title: "AI Infrastructure", weightBps: 2400, gradient: bagGradient({ id: "a", title: "AI Infrastructure", subtitle: "" }) },
      { title: "Megacap Builders", weightBps: 1800, gradient: bagGradient({ id: "b", title: "Megacap Builders", subtitle: "" }) },
    ],
  }),
};

for (const [name, node] of Object.entries(cards)) {
  const started = performance.now();
  const png = await renderPng(node);
  const file = join(out, `${name}.png`);
  await writeFile(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(0)} KB  ${(performance.now() - started).toFixed(0)} ms`);
}
