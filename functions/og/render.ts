// satori (element -> SVG) + resvg (SVG -> PNG). Fonts ship with the code: `infra/og.ts` copies `fonts/` next to
// the Lambda bundle, so this URL resolves both locally (functions/og/fonts) and on Lambda.
import { readFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import satori, { type SatoriOptions } from "satori";
import { HEIGHT, WIDTH, type OgNode } from "./cards";

export const FONT_DIR = new URL("./fonts/", import.meta.url);

const FONTS: { file: string; name: string; weight: 400 | 500 | 600 | 700; style: "normal" | "italic" }[] = [
  { file: "newsreader-display-500.ttf", name: "Newsreader", weight: 500, style: "normal" },
  { file: "newsreader-display-400-italic.ttf", name: "Newsreader", weight: 400, style: "italic" },
  { file: "newsreader-text-400.ttf", name: "NewsreaderText", weight: 400, style: "normal" },
  { file: "inter-500.ttf", name: "Inter", weight: 500, style: "normal" },
  { file: "inter-600.ttf", name: "Inter", weight: 600, style: "normal" },
  { file: "inter-700.ttf", name: "Inter", weight: 700, style: "normal" },
  { file: "jetbrains-mono-600.ttf", name: "Mono", weight: 600, style: "normal" },
];

let fontCache: Promise<SatoriOptions["fonts"]> | null = null;

function loadFonts() {
  fontCache ??= Promise.all(
    FONTS.map(async ({ file, ...font }) => ({ ...font, data: await readFile(new URL(file, FONT_DIR)) })),
  ).catch((error) => {
    fontCache = null;
    throw error;
  });
  return fontCache;
}

export async function renderSvg(node: OgNode) {
  // satori accepts React-element-shaped objects; ours are plain objects with the same shape.
  return satori(node as unknown as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts: await loadFonts() });
}

export async function renderPng(node: OgNode): Promise<Buffer> {
  const svg = await renderSvg(node);
  // satori already outlines text, so skip resvg's system font scan (it dominates render time).
  return new Resvg(svg, { fitTo: { mode: "width", value: WIDTH }, font: { loadSystemFonts: false } }).render().asPng();
}
