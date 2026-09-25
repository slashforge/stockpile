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
  { name: "Microsoft", pattern: /\bMicrosoft\b/i, bags: ["megacap-builders", "ai-infrastructure"] },
  { name: "Apple", pattern: /\bApple\b/i, bags: ["megacap-builders"] },
  { name: "Amazon", pattern: /\bAmazon\b/i, bags: ["consumer-frontiers"] },
  { name: "Google", pattern: /\bGoogle\b|\bAlphabet\b/i, bags: ["ai-infrastructure"] },
  { name: "Tesla", pattern: /\bTesla\b/i, bags: ["consumer-frontiers"] },
  { name: "Netflix", pattern: /\bNetflix\b/i, bags: ["consumer-frontiers"] },
  { name: "AMD", pattern: /\bAMD\b/, bags: ["ai-infrastructure"] },
] as const;
export type Company = (typeof companies)[number];

// Single-company publisher feeds map every item to fixed bags; multi-company press feeds keep only items that
// explicitly mention a mapped company. All URLs are fixed here; no arbitrary input.
export const sources = [
  { publisher: "Microsoft Official Blog", company: "Microsoft", host: "blogs.microsoft.com", url: "https://blogs.microsoft.com/feed/", bags: ["megacap-builders", "ai-infrastructure"] },
  { publisher: "NVIDIA Blog", company: "NVIDIA", host: "blogs.nvidia.com", url: "https://blogs.nvidia.com/feed/", bags: ["megacap-builders", "ai-infrastructure"] },
  { publisher: "Apple Newsroom", company: "Apple", host: "www.apple.com", url: "https://www.apple.com/newsroom/rss-feed.rss", bags: ["megacap-builders"] },
  { publisher: "Amazon News", company: "Amazon", host: "www.aboutamazon.com", url: "https://www.aboutamazon.com/rss/feed.rss", bags: ["consumer-frontiers"] },
  { publisher: "Google Blog", company: "Google", host: "blog.google", url: "https://blog.google/rss/", bags: ["ai-infrastructure"] },
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
    result.set(url, { id: storyId(url), canonicalUrl: url, title, excerpt, format: "article", publisher: source.publisher, publishedAt, bagIds, company });
    if (result.size === 5) break;
  }
  return [...result.values()];
}

export function parsePodcastEpisodes(data: unknown): Draft[] {
  const episodes = (data && typeof data === "object" && "results" in data && Array.isArray(data.results) ? data.results : []) as Record<string, unknown>[];
  if (!episodes.some((entry) => entry.wrapperType === "track" && entry.collectionId === 1186480811 && entry.artistName === "NVIDIA" && entry.trackName === "NVIDIA AI Podcast")) return [];
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
      publishedAt, bagIds: ["ai-infrastructure", "megacap-builders"], company: "NVIDIA" });
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
  const errors: string[] = [];
  const ingestDrafts = async (drafts: Draft[]) => {
    for (const draft of drafts) {
      const { eq } = await import("drizzle-orm");
      const [existing] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, draft.id)).limit(1);
      if (existing) continue;
      const curated = options.ai === false ? editorial(draft) : await curate(draft);
      await db.insert(stories).values({ id: draft.id, canonicalUrl: draft.canonicalUrl, title: draft.title, format: draft.format, summary: curated.summary,
        publisher: draft.publisher, publishedAt: draft.publishedAt, imageUrl: null, imageCredit: null, connections: curated.connections,
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
  return { inserted, errors };
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
