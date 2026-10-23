// Writes the web app's static default card (apps/web/public/og-image.png, committed). It is the og:image for every
// app page without its own card, and the fallback when a dynamic card fails. Re-run after changing the design:
//   bun run --cwd functions og:static
import { writeFile } from "node:fs/promises";
import { HomeCard } from "./cards";
import { cardAssets } from "./data";
import { renderPng } from "./render";

const logo = (symbol: string) => `https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`;
const assets = await cardAssets(
  [
    { symbol: "NVDAx", name: "NVIDIA xStock", weightBps: 2400, brandColor: "#78b808" },
    { symbol: "MSFTx", name: "Microsoft xStock", weightBps: 1400, brandColor: "#fdb92c" },
    { symbol: "GOOGLx", name: "Alphabet xStock", weightBps: 1200, brandColor: "#f71603" },
    { symbol: "AMZNx", name: "Amazon xStock", weightBps: 1000, brandColor: "#f89808" },
    { symbol: "PLTRx", name: "Palantir xStock", weightBps: 1000, brandColor: "#101113" },
    { symbol: "AVGOx", name: "Broadcom xStock", weightBps: 1000, brandColor: "#cc092f" },
    { symbol: "AMDx", name: "AMD xStock", weightBps: 1000, brandColor: "#1a1a1a" },
    { symbol: "INTCx", name: "Intel xStock", weightBps: 1000, brandColor: "#0068b5" },
  ].map((asset) => ({ ...asset, iconUrl: logo(asset.symbol) })),
  3,
);

const out = new URL("../../apps/web/public/og-image.png", import.meta.url);
const png = await renderPng(
  HomeCard({
    url: "app.newsbid.trade",
    section: "Open the app",
    kicker: "Stories, bags, one slide",
    lead: "Read the story, look inside the bag, and buy the whole basket from your own wallet.",
    bag: { title: "AI Infrastructure", assets },
  }),
);
await writeFile(out, png);
console.log(`wrote ${out.pathname} (${(png.length / 1024).toFixed(0)} KB)`);
