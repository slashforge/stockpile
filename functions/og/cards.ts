// Newsbid Open Graph cards (1200x630), rendered with satori. Same editorial look as the landing page:
// newsprint paper, a masthead with a double rule, Newsreader headlines, JetBrains Mono labels, brand blue.
// Cards are plain element objects (no React): `h(type, props, ...children)`.

export interface OgNode {
  type: string;
  key: null;
  props: Record<string, unknown>;
}
type Child = OgNode | string | number | null | undefined | false;
type Style = Record<string, string | number>;

export function h(type: string, props: Record<string, unknown> | null, ...children: (Child | Child[])[]): OgNode {
  const kids = children.flat().filter((c): c is OgNode | string | number => c !== null && c !== undefined && c !== false);
  return { type, key: null, props: { ...props, children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids } };
}

/** Flex box; satori requires `display: flex` on anything with more than one child. */
const box = (style: Style, ...children: (Child | Child[])[]) => h("div", { style: { display: "flex", ...style } }, ...children);
const text = (style: Style, value: string) => h("div", { style: { display: "flex", ...style } }, value);

export const COLORS = {
  paper: "#F3F1EC",
  ink: "#0C0F19",
  text: "#10131F",
  subtle: "#4D5468",
  muted: "#767D92",
  rule: "rgba(16,19,31,0.16)",
  brand: "#2563EB",
  brandSoft: "#E8F0FF",
  positive: "#0B8A67",
  positiveSoft: "#E3F8F1",
  danger: "#C92F42",
  caution: "#A1510A",
  white: "#FFFFFF",
};
const SERIF = "Newsreader";
const SERIF_TEXT = "NewsreaderText";
const SANS = "Inter";
const MONO = "Mono";

export const WIDTH = 1200;
export const HEIGHT = 630;

// apps/landing/public/favicon.svg
const LOGO_SVG = `<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#2563EB"/></linearGradient></defs><rect width="500" height="500" rx="120" fill="url(#g)"/><g transform="translate(40 40) scale(0.84)" fill="#fff" stroke="#fff"><path stroke="none" fill-rule="evenodd" clip-rule="evenodd" d="M136 186H364C386 186 398 198 400 218L418 398C421 426 404 444 376 444H124C96 444 79 426 82 398L100 218C102 198 114 186 136 186ZM177 322C168 322 162 328 162 337V386C162 395 168 401 177 401H203C212 401 218 395 218 386V337C218 328 212 322 203 322H177ZM237 282C228 282 222 288 222 297V386C222 395 228 401 237 401H263C272 401 278 395 278 386V297C278 288 272 282 263 282H237ZM297 238C288 238 282 244 282 253V386C282 395 288 401 297 401H323C332 401 338 395 338 386V253C338 244 332 238 323 238H297Z"/><path d="M172 196V172C172 132 206 106 250 106C294 106 328 132 328 172V196" fill="none" stroke-width="30" stroke-linecap="round"/></g></svg>`;
const LOGO_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

/** Fallback colours when a token has no brand colour (mobile `theme.chart`). */
export const CHART_PALETTE = ["#2563EB", "#FF7A66", "#22C29A", "#0E9AB5", "#FFB23F", "#2FA8E8", "#FF6FA3", "#64748B"];

// Same theme cues as apps/landing/src/lib/bags.ts `bagGradient` (and mobile bag-art), so a bag keeps its colours.
const GRADIENTS = {
  blue: ["#2563EB", "#38BDF8"],
  coral: ["#FF8A6B", "#FFB86B"],
  mint: ["#2BCFA3", "#4DA3FF"],
  rose: ["#FF6F91", "#FF9E7A"],
  sky: ["#4DA3FF", "#6FE0E8"],
} as const;
type GradientName = keyof typeof GRADIENTS;
const THEMES: { pattern: RegExp; gradient: GradientName }[] = [
  { pattern: /\b(ai|compute|chip|semi|hardware|infrastructure)\b/i, gradient: "blue" },
  { pattern: /\b(consumer|commerce|retail|shopping|entertainment)\b/i, gradient: "coral" },
  { pattern: /\b(energy|power|utilit|grid|solar)\b/i, gradient: "mint" },
  { pattern: /\b(health|bio|pharma|medic)\b/i, gradient: "rose" },
  { pattern: /\b(financ|bank|payment|fintech)\b/i, gradient: "sky" },
  { pattern: /\b(megacap|platform|builder|software|cloud|computing)\b/i, gradient: "rose" },
];
const FALLBACK: GradientName[] = ["blue", "mint", "coral", "rose", "sky"];

function hash(value: string) {
  let n = 0;
  for (let i = 0; i < value.length; i++) n = (n * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(n);
}

export function bagGradient(bag: { id: string; title: string; subtitle: string }): readonly [string, string] {
  const match = THEMES.find(({ pattern }) => pattern.test(`${bag.title} ${bag.subtitle}`));
  return GRADIENTS[match?.gradient ?? FALLBACK[hash(bag.id) % FALLBACK.length]!];
}

// ---------------------------------------------------------------------------------------------------------------
// Card inputs (decoupled from the API shapes; see data.ts for the mapping).

export interface CardAsset {
  symbol: string;
  name: string;
  weightBps: number;
  color: string;
  /** Inline data URI (fetched ahead of time); null draws a monogram. */
  icon: string | null;
}

export interface PageCardInput {
  /** Mono label in the masthead, e.g. "The Journal". */
  section: string;
  /** Optional mono kicker above the title, e.g. a date. */
  kicker?: string;
  title: string;
  description?: string;
  url: string;
}

export interface HomeCardInput {
  url: string;
  section?: string;
  kicker?: string;
  lead?: string;
  bag?: { title: string; assets: CardAsset[] };
}

export interface BagCardInput {
  url: string;
  title: string;
  subtitle: string;
  issuer: "xstocks" | "prestocks";
  sourceType: "editorial" | "disclosure" | "media";
  curator: string;
  tradable: boolean;
  assets: CardAsset[];
  /** Bag-index returns in percent; null when the window is not covered. */
  returns: { m1: number | null; y1: number | null; sparkline: number[] } | null;
  change24h: number | null;
  gradient: readonly [string, string];
}

export interface AssetCardInput {
  url: string;
  symbol: string;
  company: string;
  issuer: "xstocks" | "prestocks";
  underlying: string | null;
  icon: string | null;
  color: string;
  price: number | null;
  change24h: number | null;
  bags: { title: string; weightBps: number; gradient: readonly [string, string] }[];
}

// ---------------------------------------------------------------------------------------------------------------
// Formatting helpers

export function clampText(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Largest size whose estimated width fits `lines` lines of `width` px (upright Newsreader averages ~0.52em per glyph). */
function fitSize(value: string, width: number, lines: number, sizes: number[], em = 0.52) {
  return sizes.find((size) => value.length * size * em <= width * lines) ?? sizes[sizes.length - 1]!;
}

/** Prefer one line (side columns are short on height); only very long titles wrap to two smaller lines. */
function fitColumnTitle(value: string, width: number) {
  const single = [92, 84, 76, 68, 62].find((size) => value.length * size * 0.52 <= width);
  return single ?? fitSize(value, width, 2, [58, 52, 46]);
}

export function formatPct(value: number) {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : 1;
  const sign = value > 0.05 ? "+" : value < -0.05 ? "−" : "";
  return `${sign}${abs.toFixed(digits)}%`;
}

function formatPrice(value: number) {
  const digits = value >= 1000 ? 0 : value >= 1 ? 2 : 4;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

const weight = (bps: number) => `${Math.round(bps / 100)}%`;
const tone = (value: number | null) => (value === null || Math.abs(value) < 0.05 ? COLORS.subtle : value > 0 ? COLORS.positive : COLORS.danger);
export const monogram = (symbol: string) => symbol.replace(/x$/, "").slice(0, 2).toUpperCase();

// ---------------------------------------------------------------------------------------------------------------
// Building blocks

const kickerStyle: Style = { fontFamily: MONO, fontSize: 15, letterSpacing: 2.4, textTransform: "uppercase", color: COLORS.subtle };

function Masthead(section: string) {
  return box(
    { flexDirection: "column" },
    box(
      { alignItems: "center", justifyContent: "space-between" },
      box(
        { alignItems: "center" },
        h("img", { src: LOGO_URI, width: 40, height: 40, style: { borderRadius: 10, marginRight: 12 } }),
        text({ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: -1, color: COLORS.text }, "Newsbid"),
      ),
      text(kickerStyle, section),
    ),
    // Newspaper double rule
    box({ flexDirection: "column", marginTop: 18 }, box({ height: 3, backgroundColor: COLORS.ink }), box({ height: 3 }), box({ height: 1, backgroundColor: COLORS.ink })),
  );
}

function Footer(url: string, note = "Swipe the news. Buy the bag.") {
  return box(
    { alignItems: "center", justifyContent: "space-between", paddingTop: 18, borderTop: `1px solid ${COLORS.rule}` },
    text({ fontFamily: MONO, fontSize: 16, letterSpacing: 0.6, color: COLORS.subtle }, url),
    text({ fontFamily: SERIF, fontWeight: 400, fontStyle: "italic", fontSize: 22, color: COLORS.text }, note),
  );
}

function Frame(section: string, url: string, body: OgNode, note?: string) {
  return box(
    {
      width: WIDTH,
      height: HEIGHT,
      flexDirection: "column",
      backgroundColor: COLORS.paper,
      padding: "44px 64px 40px",
      fontFamily: SANS,
      color: COLORS.text,
    },
    Masthead(section),
    box({ flex: 1, flexDirection: "column", justifyContent: "center", paddingTop: 8, paddingBottom: 24 }, body),
    Footer(url, note),
  );
}

function Kicker(value: string, color: string = COLORS.brand) {
  return box(
    { alignItems: "center", marginBottom: 18 },
    box({ width: 30, height: 2, backgroundColor: color, marginRight: 12 }),
    text({ ...kickerStyle, color }, value),
  );
}

function Avatar(asset: Pick<CardAsset, "symbol" | "color" | "icon">, size: number, ring = false) {
  const style: Style = {
    width: size,
    height: size,
    borderRadius: size,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: asset.icon ? COLORS.white : tint(asset.color, 0.16),
    border: ring ? `3px solid ${COLORS.white}` : `1px solid rgba(16,19,31,0.08)`,
    flexShrink: 0,
  };
  // Issuer logos are already circular on a transparent canvas: draw them at their real size (scaling up pushes
  // the logo's own dark outline into the clip edge).
  return asset.icon
    ? box(style, h("img", { src: asset.icon, width: size, height: size, style: { width: size, height: size, borderRadius: size, flexShrink: 0, objectFit: "cover" } }))
    : box(style, text({ fontFamily: SANS, fontWeight: 700, fontSize: Math.round(size * 0.36), color: asset.color }, monogram(asset.symbol)));
}

/** Mix a hex colour with white. */
function tint(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

function AllocationBar(assets: CardAsset[], height = 8) {
  return box(
    { height, borderRadius: height / 2, overflow: "hidden" },
    ...assets.map((asset, i) => box({ flexGrow: asset.weightBps, flexBasis: 0, height, backgroundColor: asset.color, marginLeft: i === 0 ? 0 : 2 })),
  );
}

/** White clipping with an ink border and a hard offset shadow, like the landing hero's "Inside the bag" card. */
function Clip(style: Style, ...children: (Child | Child[])[]) {
  return box(
    {
      flexDirection: "column",
      backgroundColor: COLORS.white,
      border: `2px solid ${COLORS.ink}`,
      borderRadius: 22,
      boxShadow: `8px 8px 0 ${COLORS.ink}`,
      padding: "22px 24px",
      ...style,
    },
    ...children,
  );
}

function ClipHeader(left: string, right: string) {
  return box(
    { alignItems: "center", justifyContent: "space-between" },
    text({ fontFamily: MONO, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: COLORS.muted }, left),
    text({ fontFamily: SANS, fontWeight: 600, fontSize: 15, color: COLORS.muted }, right),
  );
}

function HoldingRows(assets: CardAsset[], limit: number, size = 36, withNames = true) {
  const shown = assets.slice(0, limit);
  return box(
    { flexDirection: "column", width: "100%" },
    ...shown.map((asset, i) =>
      box(
        { alignItems: "center", paddingTop: 10, paddingBottom: 10, borderTop: i === 0 ? "0px solid transparent" : `1px solid #EEF0F7` },
        Avatar(asset, size),
        box(
          { flexDirection: "column", flex: 1, marginLeft: 14, overflow: "hidden" },
          text({ fontFamily: SANS, fontWeight: 600, fontSize: 19, color: COLORS.text }, asset.symbol),
          withNames ? text({ fontFamily: SANS, fontWeight: 500, fontSize: 14, color: COLORS.muted }, clampText(asset.name.replace(/\s+(xStocks?|PreStocks?)$/i, ""), 24)) : null,
        ),
        text({ fontFamily: MONO, fontSize: 19, color: COLORS.text }, weight(asset.weightBps)),
      ),
    ),
  );
}

function Sparkline(points: number[], width: number, height: number, color: string) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return h(
    "svg",
    { width, height, viewBox: `0 0 ${width} ${height}` },
    h("path", { d: area, fill: color, fillOpacity: 0.1 }),
    h("path", { d: line, fill: "none", stroke: color, strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" }),
  );
}

function Stat(label: string, value: string, color: string = COLORS.text, size = 40) {
  return box(
    { flexDirection: "column", marginRight: 40 },
    text({ fontFamily: MONO, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: COLORS.muted, marginBottom: 6 }, label),
    text({ fontFamily: MONO, fontSize: size, letterSpacing: -1, color }, value),
  );
}

function Pill(label: string, color: string, background: string, dot = false) {
  return box(
    { alignItems: "center", padding: "6px 14px", borderRadius: 999, backgroundColor: background, marginRight: 10 },
    dot ? box({ width: 9, height: 9, borderRadius: 9, backgroundColor: color, marginRight: 8 }) : null,
    text({ fontFamily: SANS, fontWeight: 600, fontSize: 16, color }, label),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Cards

/** Generic page: blog posts, the journal index, legal pages, app screens without their own card. */
export function PageCard(input: PageCardInput) {
  const title = clampText(input.title, 110);
  const size = fitSize(title, 1060, 2, [84, 76, 68, 60, 54]);
  return Frame(
    input.section,
    input.url,
    box(
      { flexDirection: "column" },
      input.kicker ? Kicker(input.kicker) : null,
      text({ fontFamily: SERIF, fontWeight: 500, fontSize: size, lineHeight: 1.04, letterSpacing: -size * 0.025, color: COLORS.text, maxWidth: 1060 }, title),
      input.description
        ? text(
            { fontFamily: SERIF_TEXT, fontSize: 28, lineHeight: 1.4, color: COLORS.subtle, marginTop: 22, maxWidth: 960 },
            clampText(input.description, 150),
          )
        : null,
    ),
  );
}

/** The landing home page and the web app's default card. */
export function HomeCard(input: HomeCardInput) {
  const bag = input.bag && input.bag.assets.length > 0 ? input.bag : null;
  return Frame(
    input.section ?? "The markets, by the story",
    input.url,
    box(
      { alignItems: "center", justifyContent: "space-between" },
      box(
        { flexDirection: "column", width: bag ? 640 : 1060 },
        Kicker(input.kicker ?? "Tokenized stocks & pre-IPO names"),
        text({ fontFamily: SERIF, fontWeight: 500, fontSize: 90, lineHeight: 1.0, letterSpacing: -2.4, color: COLORS.text, whiteSpace: "nowrap" }, "Swipe the news."),
        text({ fontFamily: SERIF, fontWeight: 400, fontStyle: "italic", fontSize: 96, lineHeight: 1.02, letterSpacing: -2.4, color: COLORS.brand, whiteSpace: "nowrap" }, "Buy the bag."),
        text(
          { fontFamily: SERIF_TEXT, fontSize: 25, lineHeight: 1.4, color: COLORS.subtle, marginTop: 22, maxWidth: 600 },
          input.lead ?? "A news feed where every story is pinned to a bag of tokenized stocks you can buy in one slide.",
        ),
      ),
      bag
        ? Clip(
            { width: 360, transform: "rotate(-2.5deg)", marginRight: 12 },
            ClipHeader("Inside the bag", `${bag.assets.length} tokens`),
            text({ fontFamily: SERIF, fontWeight: 500, fontSize: 32, lineHeight: 1.1, letterSpacing: -0.6, marginTop: 8, marginBottom: 14 }, clampText(bag.title, 22)),
            AllocationBar(bag.assets),
            box({ marginTop: 6 }, HoldingRows(bag.assets, 3, 34, false)),
          )
        : null,
    ),
    "Tokenized stocks, on Solana.",
  );
}

/** A shared bag link: thesis on the left, holdings clipping on the right, returns when we have them. */
export function BagCard(input: BagCardInput) {
  const title = clampText(input.title, 40);
  const size = fitColumnTitle(title, 620);
  const preIpo = input.issuer === "prestocks";
  const kicker = input.sourceType === "editorial" ? `Newsbid Editorial · ${preIpo ? "PreStocks" : "xStocks"}` : `Tracker · ${input.curator}`;
  const m1 = input.returns?.m1 ?? null;
  const y1 = input.returns?.y1 ?? null;
  const spark = input.returns?.sparkline ?? [];
  const headline = m1 !== null ? { label: "1M", value: m1 } : y1 !== null ? { label: "1Y", value: y1 } : null;
  const [from, to] = input.gradient;
  const largest = input.assets[0];

  const stats = headline
    ? box(
        { alignItems: "flex-end" },
        Stat(`${headline.label} bag index`, formatPct(headline.value), tone(headline.value)),
        spark.length > 1 ? box({ marginRight: 40, marginBottom: 4 }, Sparkline(spark, 170, 52, tone(headline.value))) : null,
        input.change24h !== null ? Stat("24h", formatPct(input.change24h), tone(input.change24h)) : null,
      )
    : largest
      ? box(
          { alignItems: "flex-end" },
          Stat("Tokens", String(input.assets.length)),
          Stat("Largest", `${largest.symbol} ${weight(largest.weightBps)}`),
          input.change24h !== null ? Stat("24h", formatPct(input.change24h), tone(input.change24h)) : null,
        )
      : box({}, Stat("Source", input.sourceType === "media" ? "Mad Money calls" : "STOCK Act filings", COLORS.text, 30));

  return Frame(
    "The bag desk",
    input.url,
    box(
      { alignItems: "center", justifyContent: "space-between" },
      box(
        { flexDirection: "column", width: 640 },
        box(
          { alignItems: "center", marginBottom: 16 },
          box({ width: 30, height: 30, borderRadius: 9, backgroundImage: `linear-gradient(135deg, ${from}, ${to})`, marginRight: 12 }),
          text({ ...kickerStyle, color: COLORS.brand }, clampText(kicker, 44)),
        ),
        text({ fontFamily: SERIF, fontWeight: 500, fontSize: size, lineHeight: 1.0, letterSpacing: -size * 0.025, color: COLORS.text }, title),
        text({ fontFamily: SERIF_TEXT, fontSize: 25, lineHeight: 1.36, color: COLORS.subtle, marginTop: 14 }, clampText(input.subtitle, 92)),
        box(
          { marginTop: 18, marginBottom: 26 },
          input.tradable ? Pill("Open to buy", COLORS.positive, COLORS.positiveSoft, true) : Pill("Research only", COLORS.subtle, "#E6E3DB", true),
          preIpo ? Pill("Pre-IPO", COLORS.caution, "#FFF3E0") : null,
        ),
        stats,
      ),
      input.assets.length > 0
        ? Clip(
            { width: 410, transform: "rotate(1.5deg)", marginRight: 10 },
            ClipHeader("Holdings", `${input.assets.length} tokens`),
            box({ marginTop: 14, marginBottom: 6, flexDirection: "column" }, AllocationBar(input.assets, 10)),
            HoldingRows(input.assets, input.assets.length > 5 ? 4 : 5),
            input.assets.length > 5
              ? text({ fontFamily: SANS, fontWeight: 600, fontSize: 15, color: COLORS.muted, marginTop: 4 }, `+${input.assets.length - 4} more in the app`)
              : null,
          )
        : Clip(
            { width: 410, transform: "rotate(1.5deg)", marginRight: 10 },
            ClipHeader("Holdings", "Computed live"),
            text({ fontFamily: SERIF, fontWeight: 500, fontSize: 30, lineHeight: 1.15, marginTop: 14 }, clampText(input.curator, 40)),
            text(
              { fontFamily: SERIF_TEXT, fontSize: 20, lineHeight: 1.4, color: COLORS.subtle, marginTop: 10 },
              input.sourceType === "media" ? "Built from Mad Money calls. Every holding cites its source." : "Built from STOCK Act filings. Every holding cites its filing.",
            ),
          ),
    ),
    headline ? "Bag index, not a forecast." : undefined,
  );
}

/** A shared token link: the token, its price move, and the bags that hold it. */
export function AssetCard(input: AssetCardInput) {
  const company = clampText(input.company, 28);
  const size = fitColumnTitle(company, 620);
  const issuer = input.issuer === "prestocks" ? "PreStocks · Pre-IPO" : "xStocks";
  const kicker = input.underlying ? `${issuer} · Tracks ${input.underlying}` : issuer;
  return Frame(
    "On the tape",
    input.url,
    box(
      { alignItems: "center", justifyContent: "space-between" },
      box(
        { flexDirection: "column", width: 640 },
        box(
          { alignItems: "center", marginBottom: 20 },
          Avatar({ symbol: input.symbol, color: input.color, icon: input.icon }, 64),
          box(
            { flexDirection: "column", marginLeft: 18 },
            text({ fontFamily: MONO, fontSize: 30, letterSpacing: 0.5, color: COLORS.text }, input.symbol),
            text({ ...kickerStyle, fontSize: 13, color: COLORS.brand, marginTop: 2 }, clampText(kicker, 40)),
          ),
        ),
        text({ fontFamily: SERIF, fontWeight: 500, fontSize: size, lineHeight: 1.0, letterSpacing: -size * 0.025, color: COLORS.text }, company),
        box(
          { alignItems: "flex-end", marginTop: 30 },
          input.price !== null ? Stat("Price", formatPrice(input.price), COLORS.text, 46) : null,
          input.change24h !== null ? Stat("24h", formatPct(input.change24h), tone(input.change24h), 46) : null,
          input.price === null && input.change24h === null ? Stat("In bags", String(input.bags.length), COLORS.text, 46) : null,
        ),
      ),
      input.bags.length > 0
        ? Clip(
            { width: 410, transform: "rotate(1.5deg)", marginRight: 10 },
            ClipHeader("Held in", `${input.bags.length} ${input.bags.length === 1 ? "bag" : "bags"}`),
            box(
              { flexDirection: "column", marginTop: 8 },
              ...input.bags.slice(0, 5).map((bag, i) =>
                box(
                  { alignItems: "center", paddingTop: 11, paddingBottom: 11, borderTop: i === 0 ? "0px solid transparent" : "1px solid #EEF0F7" },
                  box({ width: 34, height: 34, borderRadius: 10, backgroundImage: `linear-gradient(135deg, ${bag.gradient[0]}, ${bag.gradient[1]})`, flexShrink: 0 }),
                  text({ fontFamily: SANS, fontWeight: 600, fontSize: 19, color: COLORS.text, flex: 1, marginLeft: 14 }, clampText(bag.title, 22)),
                  text({ fontFamily: MONO, fontSize: 19, color: COLORS.text }, weight(bag.weightBps)),
                ),
              ),
            ),
            input.bags.length > 5
              ? text({ fontFamily: SANS, fontWeight: 600, fontSize: 15, color: COLORS.muted, marginTop: 4 }, `+${input.bags.length - 5} more`)
              : null,
          )
        : null,
    ),
  );
}
