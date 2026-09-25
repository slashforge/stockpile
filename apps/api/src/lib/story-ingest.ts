import { XMLParser } from "fast-xml-parser";
import { db } from "@stockpile/core/db";
import { stories } from "@stockpile/core/db/schema";
import { canonicalUrl, curate, editorial, safeText, stance, storyId, type Draft } from "./story-curator";

/** Companies whose explicit mention in a multi-company feed maps a story to bags. Pre-IPO names map to PreStocks-backed bags. */
export const companies = [
  { name: "OpenAI", pattern: /\bOpenAI\b/i, bags: ["frontier-ai-labs"] },
  { name: "Anthropic", pattern: /\bAnthropic\b/i, bags: ["frontier-ai-labs"] },
  { name: "Figure AI", pattern: /\bFigure\s?AI\b/i, bags: ["frontier-ai-labs"] },
  { name: "Neuralink", pattern: /\bNeuralink\b/i, bags: ["frontier-ai-labs"] },
  { name: "Kalshi", pattern: /\bKalshi\b/i, bags: ["prediction-markets"] },
  { name: "Polymarket", pattern: /\bPolymarket\b/i, bags: ["prediction-markets"] },
  { name: "SpaceX", pattern: /\bSpaceX\b|\bStarlink\b/i, bags: ["defense-space"] },
  { name: "Anduril", pattern: /\bAnduril\b/i, bags: ["defense-space"] },
  { name: "NVIDIA", pattern: /\bNVIDIA\b/i, bags: ["megacap-builders", "ai-infrastructure"] },
  { name: "Microsoft", pattern: /\bMicrosoft\b/i, bags: ["megacap-builders", "ai-infrastructure", "cloud-software"] },
  { name: "Apple", pattern: /\bApple\b/i, bags: ["megacap-builders"] },
  { name: "Amazon", pattern: /\bAmazon\b|\bAWS\b/, bags: ["megacap-builders", "consumer-frontiers", "ai-infrastructure", "cloud-software"] },
  { name: "Google", pattern: /\bGoogle\b|\bAlphabet\b/i, bags: ["megacap-builders", "ai-infrastructure", "cloud-software"] },
  { name: "Meta", pattern: /\bMeta\b(?!\s*(?:data|-))|\bInstagram\b|\bFacebook\b/, bags: ["megacap-builders", "consumer-frontiers"] },
  { name: "Tesla", pattern: /\bTesla\b/i, bags: ["megacap-builders", "consumer-frontiers"] },
  { name: "Netflix", pattern: /\bNetflix\b/i, bags: ["consumer-frontiers"] },
  { name: "AMD", pattern: /\bAMD\b/, bags: ["ai-infrastructure"] },
  { name: "Broadcom", pattern: /\bBroadcom\b/i, bags: ["ai-infrastructure"] },
  { name: "Palantir", pattern: /\bPalantir\b/i, bags: ["ai-infrastructure", "cloud-software"] },
  { name: "Oracle", pattern: /\bOracle\b/, bags: ["cloud-software"] },
  { name: "Intel", pattern: /\bIntel\b/, bags: ["ai-infrastructure"] },
  { name: "Coinbase", pattern: /\bCoinbase\b/i, bags: ["crypto-fintech-rails"] },
  { name: "Robinhood", pattern: /\bRobinhood\b/i, bags: ["crypto-fintech-rails", "consumer-frontiers"] },
  { name: "Strategy", pattern: /\bMicroStrategy\b|\bStrategy\b.*\bbitcoin\b|\bbitcoin\b.*\bStrategy\b/i, bags: ["crypto-fintech-rails"] },
  { name: "Circle", pattern: /\bCircle\b.*\bUSDC\b|\bUSDC\b.*\bCircle\b|\bCircle Internet\b/, bags: ["crypto-fintech-rails"] },
  { name: "Bank of America", pattern: /\bBank of America\b/i, bags: ["crypto-fintech-rails"] },
  { name: "McDonald's", pattern: /\bMcDonald'?s\b/i, bags: ["consumer-frontiers", "everyday-brands"] },
  { name: "Walmart", pattern: /\bWalmart\b/i, bags: ["consumer-frontiers", "everyday-brands"] },
  { name: "Coca-Cola", pattern: /\bCoca-Cola\b|\bCoke\b/, bags: ["everyday-brands"] },
  { name: "PepsiCo", pattern: /\bPepsiCo\b|\bPepsi\b/, bags: ["everyday-brands"] },
  { name: "Procter & Gamble", pattern: /\bProcter\b/i, bags: ["everyday-brands"] },
] as const;
export type Company = (typeof companies)[number];

// Single-company publisher feeds map every item to fixed bags; multi-company press feeds keep only items that
// explicitly mention a mapped company. All URLs are fixed here; no arbitrary input.
export const sources = [
  { publisher: "Microsoft Official Blog", company: "Microsoft", host: "blogs.microsoft.com", url: "https://blogs.microsoft.com/feed/", bags: ["megacap-builders", "ai-infrastructure", "cloud-software"] },
  { publisher: "NVIDIA Blog", company: "NVIDIA", host: "blogs.nvidia.com", url: "https://blogs.nvidia.com/feed/", bags: ["megacap-builders", "ai-infrastructure"] },
  { publisher: "Apple Newsroom", company: "Apple", host: "www.apple.com", url: "https://www.apple.com/newsroom/rss-feed.rss", bags: ["megacap-builders"] },
  { publisher: "Amazon News", company: "Amazon", host: "www.aboutamazon.com", url: "https://www.aboutamazon.com/rss/feed.rss", bags: ["megacap-builders", "consumer-frontiers", "ai-infrastructure", "cloud-software"] },
  { publisher: "Google Blog", company: "Google", host: "blog.google", url: "https://blog.google/rss/", bags: ["megacap-builders", "ai-infrastructure", "cloud-software"] },
  { publisher: "OpenAI News", company: "OpenAI", host: "openai.com", url: "https://openai.com/news/rss.xml", bags: ["frontier-ai-labs"], maxBytes: 1_500_000 },
  { publisher: "TechCrunch AI", host: "techcrunch.com", url: "https://techcrunch.com/category/artificial-intelligence/feed/", companies },
  { publisher: "Ars Technica", host: "arstechnica.com", url: "https://feeds.arstechnica.com/arstechnica/index", companies },
  { publisher: "CNBC Technology", host: "www.cnbc.com", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", companies },
  { publisher: "Breaking Defense", host: "breakingdefense.com", url: "https://breakingdefense.com/feed/", companies },
  { publisher: "SpaceNews", host: "spacenews.com", url: "https://spacenews.com/feed/", companies },
] as const;
export type Source = (typeof sources)[number];

/** Explicit company mentions in title/excerpt, in catalogue order. Exported for tests. */
export function matchCompanies(text: string, catalogue: readonly Company[] = companies) {
  return catalogue.filter((company) => company.pattern.test(text));
}
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: true, trimValues: true });

async function boundedBody(response: Response, maxBytes: number) {
  if (!response.ok || !response.body || Number(response.headers.get("content-length") || 0) > maxBytes) throw new Error(`Provider response rejected: ${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Provider response too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function readLimited(url: string, maxBytes = 512_000) {
  const response = await fetch(url, { redirect: "error", headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(10000) });
  const type = response.headers.get("content-type") ?? "";
  if (type && !/xml|rss|atom/i.test(type)) throw new Error("Feed content type rejected");
  const text = await boundedBody(response, maxBytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Feed entity declarations rejected");
  return text;
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") return text((value as { "#text"?: unknown })["#text"]);
  return "";
}

/** A displayable https image URL (no credentials, bounded length), else null. Exported for tests. */
export function safeImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim().replace(/&amp;/g, "&"));
    if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2048) return null;
    return url.href;
  } catch { return null; }
}

type Node = Record<string, unknown>;
const nodes = (value: unknown) => (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Node[];
const attr = (node: Node, name: string) => (typeof node[`@_${name}`] === "string" || typeof node[`@_${name}`] === "number" ? String(node[`@_${name}`]) : "");
const isImageMedia = (node: Node) => attr(node, "medium") === "image" || attr(node, "type").startsWith("image/")
  || (!attr(node, "medium") && !attr(node, "type") && /\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(attr(node, "url")));

/** First real `<img>` in an HTML fragment, skipping tracking pixels, emoji and avatars. */
function htmlImage(html: string): string | null {
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const width = Number(/\bwidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    if (!src || (width > 0 && width < 120) || /emoji|gravatar|pixel|feedburner|\/ads?\//i.test(src)) continue;
    const url = safeImageUrl(src);
    if (url) return url;
  }
  return null;
}

/** Lead image for a feed entry: Media RSS content/thumbnails, image enclosures, iTunes art, then the first inline `<img>`. Exported for tests. */
export function entryImage(entry: Node): string | null {
  const groups = nodes(entry["media:group"]);
  const media = [...nodes(entry["media:content"]), ...groups.flatMap((group) => nodes(group["media:content"]))].filter(isImageMedia)
    .sort((a, b) => Number(attr(b, "width") || 0) - Number(attr(a, "width") || 0));
  const candidates = [
    ...media.map((node) => attr(node, "url")),
    ...[...nodes(entry["media:thumbnail"]), ...groups.flatMap((group) => nodes(group["media:thumbnail"]))].map((node) => attr(node, "url")),
    ...nodes(entry.enclosure).filter((node) => attr(node, "type").startsWith("image/")).map((node) => attr(node, "url")),
    ...nodes(entry["itunes:image"]).map((node) => attr(node, "href")),
  ];
  for (const candidate of candidates) {
    const url = safeImageUrl(candidate);
    if (url) return url;
  }
  for (const key of ["content:encoded", "content", "description", "summary"]) {
    const url = htmlImage(text(entry[key]));
    if (url) return url;
  }
  return null;
}

/** `og:image` / `twitter:image` from an article page's HTML. Exported for tests. */
export function pageImage(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\b(?:property|name)\s*=\s*["'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["']/i.test(tag)) continue;
    const url = safeImageUrl(/\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
    if (url) return url;
  }
  return null;
}

/** Reads at most `maxBytes` of an HTML page, stopping early once `</head>` (where the share image lives) has arrived. */
async function readHead(response: Response, maxBytes: number) {
  if (!response.ok || !response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  try {
    while (html.length < maxBytes) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return html;
}

/** Share image from the article page itself, for feeds that carry no media. The URL is already canonical on the source's fixed host. */
async function fetchPageImage(url: string): Promise<string | null> {
  try {
    const get = (target: string) => fetch(target, { redirect: "manual", headers: { Accept: "text/html" }, signal: AbortSignal.timeout(7000) });
    let response = await get(url);
    // Follow a single same-host redirect (e.g. a trailing-slash canonicalisation); never leave the source's host.
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (location) {
      const next = new URL(location, url);
      if (next.protocol !== "https:" || next.host !== new URL(url).host) return null;
      response = await get(next.href);
    }
    if (!/html/i.test(response.headers.get("content-type") ?? "")) return null;
    return pageImage(await readHead(response, 600_000));
  } catch { return null; }
}

export function parseFeed(xml: string, source: Source): Draft[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Feed entity declarations rejected");
  const document = parser.parse(xml) as { rss?: { channel?: { item?: unknown } }; feed?: { entry?: unknown } };
  const feed = document.rss?.channel?.item ?? document.feed?.entry;
  const entries = (Array.isArray(feed) ? feed : feed ? [feed] : []).slice(0, 15) as Record<string, unknown>[];
  const result = new Map<string, Draft>();
  for (const entry of entries) {
    const rawLink = entry.link;
    const link = Array.isArray(rawLink) ? rawLink.find((item) => item?.["@_href"] && (!item["@_rel"] || item["@_rel"] === "alternate"))?.["@_href"]
      : rawLink && typeof rawLink === "object" ? (rawLink as { "@_href"?: string })["@_href"] : text(rawLink);
    const url = canonicalUrl(String(link ?? ""), source.host);
    const title = safeText(text(entry.title), 180);
    const excerpt = safeText(text(entry.description ?? entry.summary ?? entry.content), 700);
    const rawDate = text(entry.pubDate ?? entry.published ?? entry.updated);
    const publishedAt = new Date(rawDate);
    if (!url || title.length < 12 || excerpt.length < 24 || !Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() > Date.now() + 300_000) continue;
    let company: string;
    let bagIds: string[];
    if ("companies" in source) {
      const matched = matchCompanies(`${title} ${excerpt}`, source.companies);
      if (!matched.length) continue;
      company = matched[0]!.name;
      bagIds = [...new Set(matched.flatMap((item) => item.bags))];
    } else { company = source.company; bagIds = [...source.bags]; }
    result.set(url, { id: storyId(url), canonicalUrl: url, title, excerpt, format: "article", publisher: source.publisher, publishedAt, bagIds, company, imageUrl: entryImage(entry) });
    if (result.size === 5) break;
  }
  return [...result.values()];
}

export function parsePodcastEpisodes(data: unknown): Draft[] {
  const episodes = (data && typeof data === "object" && "results" in data && Array.isArray(data.results) ? data.results : []) as Record<string, unknown>[];
  const show = episodes.find((entry) => entry.wrapperType === "track" && entry.collectionId === 1186480811 && entry.artistName === "NVIDIA" && entry.trackName === "NVIDIA AI Podcast");
  if (!show) return [];
  const result: Draft[] = [];
  for (const episode of episodes.slice(0, 12)) {
    if (episode.wrapperType !== "podcastEpisode" || episode.collectionName !== "NVIDIA AI Podcast" || episode.collectionId !== 1186480811) continue;
    const url = canonicalUrl(String(episode.trackViewUrl ?? ""), "podcasts.apple.com");
    if (!url || !/^\/us\/podcast\/.+\/id1186480811$/.test(new URL(url).pathname) || !/^\d+$/.test(new URL(url).searchParams.get("i") ?? "")) continue;
    const title = safeText(String(episode.trackName ?? ""), 180);
    const excerpt = safeText(String(episode.description ?? ""), 700);
    const publishedAt = new Date(String(episode.releaseDate ?? ""));
    if (title.length < 12 || excerpt.length < 24 || !Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() > Date.now() + 300_000) continue;
    result.push({ id: storyId(url), canonicalUrl: url, title, excerpt, format: "podcast", publisher: "NVIDIA AI Podcast",
      publishedAt, bagIds: ["ai-infrastructure", "megacap-builders"], company: "NVIDIA",
      imageUrl: safeImageUrl(episode.artworkUrl600) ?? safeImageUrl(show.artworkUrl600) ?? safeImageUrl(episode.artworkUrl160) });
    if (result.length === 5) break;
  }
  return result;
}

async function fetchPodcastEpisodes() {
  const response = await fetch("https://itunes.apple.com/lookup?id=1186480811&entity=podcastEpisode&limit=6", {
    redirect: "error", signal: AbortSignal.timeout(7000), headers: { Accept: "application/json" },
  });
  if (!/json|javascript/i.test(response.headers.get("content-type") ?? "")) throw new Error("Podcast directory content type rejected");
  const body = await boundedBody(response, 128_000);
  return parsePodcastEpisodes(JSON.parse(body));
}

export async function ingestStories(options: { ai?: boolean } = {}) {
  let inserted = 0;
  let imaged = 0;
  const errors: string[] = [];
  const ingestDrafts = async (drafts: Draft[]) => {
    const { eq } = await import("drizzle-orm");
    for (const draft of drafts) {
      const [existing] = await db.select({ id: stories.id, imageUrl: stories.imageUrl }).from(stories).where(eq(stories.id, draft.id)).limit(1);
      if (existing?.imageUrl) continue;
      const imageUrl = draft.imageUrl ?? await fetchPageImage(draft.canonicalUrl);
      if (existing) {
        // Stories stored before images were collected pick theirs up while still in the feed.
        if (imageUrl) { await db.update(stories).set({ imageUrl, imageCredit: draft.publisher }).where(eq(stories.id, draft.id)); imaged++; }
        continue;
      }
      const curated = options.ai === false ? editorial(draft) : await curate(draft);
      await db.insert(stories).values({ id: draft.id, canonicalUrl: draft.canonicalUrl, title: draft.title, format: draft.format, summary: curated.summary,
        publisher: draft.publisher, publishedAt: draft.publishedAt, imageUrl, imageCredit: imageUrl ? draft.publisher : null, connections: curated.connections,
        provenance: curated.provenance, status: "published" }).onConflictDoNothing();
      inserted++;
    }
  };
  for (const source of sources) {
    try {
      await ingestDrafts(parseFeed(await readLimited(source.url, "maxBytes" in source ? source.maxBytes : undefined), source));
    } catch (error) { errors.push(`${source.publisher}: ${error instanceof Error ? error.message : "unknown failure"}`); }
  }
  try { await ingestDrafts(await fetchPodcastEpisodes()); }
  catch (error) { errors.push(`NVIDIA AI Podcast: ${error instanceof Error ? error.message : "unknown failure"}`); }
  return { inserted, imaged, errors };
}

/** `bun run stories:images`: fills `imageUrl` for stored articles that have none, from each article page's share image. */
export async function backfillStoryImages(limit = 200) {
  const { and, eq, isNull, desc } = await import("drizzle-orm");
  const rows = await db.select({ id: stories.id, canonicalUrl: stories.canonicalUrl, publisher: stories.publisher }).from(stories)
    .where(and(isNull(stories.imageUrl), eq(stories.format, "article"))).orderBy(desc(stories.publishedAt)).limit(limit);
  // Feed media first: some publishers (Ars Technica) carry it in the feed but refuse page fetches.
  const feedImages = new Map<string, string>();
  for (const source of sources) {
    try {
      for (const draft of parseFeed(await readLimited(source.url, "maxBytes" in source ? source.maxBytes : undefined), source)) {
        if (draft.imageUrl) feedImages.set(draft.canonicalUrl, draft.imageUrl);
      }
    } catch { /* fall back to the page image */ }
  }
  let updated = 0;
  for (const row of rows) {
    const imageUrl = feedImages.get(row.canonicalUrl) ?? await fetchPageImage(row.canonicalUrl);
    if (!imageUrl) continue;
    await db.update(stories).set({ imageUrl, imageCredit: row.publisher }).where(eq(stories.id, row.id));
    updated++;
  }
  return { scanned: rows.length, updated };
}

/** `bun run stories:recontext`: re-derives the editorial stance for persisted editorial article/podcast stories from their stored title + summary. */
export async function recontextStories() {
  const { and, eq, inArray } = await import("drizzle-orm");
  const rows = await db.select().from(stories).where(and(eq(stories.provenance, "editorial"), inArray(stories.format, ["article", "podcast"])));
  let updated = 0;
  for (const row of rows) {
    const tone = stance(`${row.title} ${row.summary}`);
    const connections = row.connections.map((connection) => ({ ...connection, context: tone.context, explanation: `${connection.explanation.replace(/ Tone (?:supporting|opposing|neutral): the source says ".*"\.$/, "")}${tone.evidence ? ` Tone ${tone.context}: the source says "${tone.evidence}".` : ""}` }));
    if (JSON.stringify(connections) === JSON.stringify(row.connections)) continue;
    await db.update(stories).set({ connections }).where(eq(stories.id, row.id));
    updated++;
  }
  return { scanned: rows.length, updated };
}
