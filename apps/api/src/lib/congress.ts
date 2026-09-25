// STOCK Act periodic transaction reports via CongressInvests (https://congressinvests.com, free tier: no key,
// 100 req/day per IP; optional CongressApiKey secret sent as X-Api-Key). Data is sourced from official House
// Clerk / Senate eFD records and is informational only; redistribution for commercial solicitation is prohibited by
// House Clerk usage terms. Only the tickers behind our tradable xStocks are ingested (8 requests per run).
import { secret } from "./config";
import { and, desc, gte, inArray, lte } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@stockpile/core/db";
import { congressDisclosures, stories } from "@stockpile/core/db/schema";

export const CONGRESS_SOURCE = "congressinvests";
const base = "https://congressinvests.com";
const filingHosts = new Set(["disclosures-clerk.house.gov", "efdsearch.senate.gov"]);
const maxBytes = 2_000_000;
const storyWindowDays = 120;
/** Underlying equity ticker -> xStock symbol. Only these tickers are ingested and only these can enter tracker bags. */
export const tickerToSymbol: Record<string, string> = { AAPL: "AAPLx", MSFT: "MSFTx", NVDA: "NVDAx", AMD: "AMDx", GOOGL: "GOOGLx", AMZN: "AMZNx", TSLA: "TSLAx", NFLX: "NFLXx" };
export const tickerNames: Record<string, string> = { AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", AMD: "AMD", GOOGL: "Alphabet", AMZN: "Amazon", TSLA: "Tesla", NFLX: "Netflix" };

export type Disclosure = { id: string; member: string; chamber: "House" | "Senate"; ticker: string; txnType: "buy" | "sell" | "exchange"; txnDate: Date; disclosedDate: Date; amountRange: string; amountLow: number; amountHigh: number; asset: string; filingUrl: string };
export type Evidence = { kind: "disclosure"; member: string; chamber: "House" | "Senate"; txnType: "buy" | "sell" | "exchange"; txnDate: string; disclosedDate: string; amountRange: string; amountMidUsd: number; url: string };
export type TrackerAsset = { ticker: string; symbol: string; name: string; weightBps: number; sourceUrl: string; evidence: Evidence[]; netUsd: number };

const money = (value: string) => Number(value.replace(/[$,\s]/g, ""));

/** Normalises one CongressInvests row; returns null for anything malformed or outside the tracked tickers. */
export function parseDisclosure(row: unknown): Disclosure | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const ticker = typeof value.ticker === "string" ? value.ticker.toUpperCase() : "";
  if (!tickerToSymbol[ticker]) return null;
  const member = typeof value.member === "string" ? value.member.replace(/\s+/g, " ").trim() : "";
  const chamber = value.chamber === "House" || value.chamber === "Senate" ? value.chamber : null;
  const type = value.trade_type === "buy" ? "buy" : typeof value.trade_type === "string" && /^sell/.test(value.trade_type) ? "sell" : value.trade_type === "exchange" ? "exchange" : null;
  const amountRange = typeof value.amount === "string" ? value.amount.replace(/\s+/g, " ").trim() : "";
  const match = amountRange.match(/^\$([\d,]+) - \$([\d,]+)$/);
  const txnDate = typeof value.tx_date === "string" ? new Date(`${value.tx_date}T00:00:00Z`) : new Date(NaN);
  const disclosedDate = typeof value.disclosed === "string" ? new Date(`${value.disclosed}T00:00:00Z`) : new Date(NaN);
  let filingUrl: string | null = null;
  try { const url = new URL(String(value.link)); filingUrl = url.protocol === "https:" && filingHosts.has(url.hostname) ? url.href : null; } catch { filingUrl = null; }
  const now = Date.now() + 864e5;
  if (!member || member.length > 80 || !chamber || !type || !match || !filingUrl || !Number.isFinite(txnDate.getTime()) || !Number.isFinite(disclosedDate.getTime()) || txnDate.getTime() > now || disclosedDate.getTime() > now || txnDate.getTime() < Date.parse("2012-01-01")) return null;
  const amountLow = money(match[1]!), amountHigh = money(match[2]!);
  if (!(amountLow >= 0 && amountHigh >= amountLow)) return null;
  const asset = typeof value.asset === "string" ? value.asset.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  const id = createHash("sha256").update([member, chamber, ticker, type, value.tx_date, value.disclosed, amountRange, filingUrl].join("|")).digest("hex").slice(0, 32);
  return { id, member, chamber, ticker, txnType: type, txnDate, disclosedDate, amountRange, amountLow, amountHigh, asset, filingUrl };
}

async function fetchTicker(ticker: string): Promise<Disclosure[]> {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "Stockpile/1.0 (+https://stockpile.app)" };
  const apiKey = secret("CongressApiKey");
  if (apiKey) headers["X-Api-Key"] = apiKey;
  const response = await fetch(`${base}/trades/${encodeURIComponent(ticker)}?limit=500`, { redirect: "error", headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok || Number(response.headers.get("content-length") || 0) > maxBytes) throw new Error(`CongressInvests ${response.status} for ${ticker}`);
  const text = await response.text();
  if (text.length > maxBytes) throw new Error("CongressInvests response too large");
  const data = JSON.parse(text) as { trades?: unknown[] };
  return (Array.isArray(data.trades) ? data.trades : []).map(parseDisclosure).filter((item): item is Disclosure => item !== null && item.ticker === ticker);
}

export const formatUsdRange = (low: number, high: number) => `${short(low)}–${short(high)}`;
const short = (value: number) => value >= 1_000_000 ? `$${trim(value / 1_000_000)}M` : value >= 1_000 ? `$${trim(value / 1_000)}K` : `$${Math.round(value)}`;
const trim = (value: number) => value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, "");
const surname = (member: string) => member.split(" ").filter((part) => part && !/^(mr|mrs|ms|jr|sr|iii?|iv)\.?$/i.test(part)).at(-1) ?? member;

/** Builds a feed story for a disclosure, linked to the tracker bags it can influence. */
export function disclosureStory(item: Disclosure) {
  const verb = item.txnType === "buy" ? "buying" : item.txnType === "sell" ? "selling" : "exchanging";
  const bagIds = ["congress-consensus", ...(/pelosi/i.test(item.member) && item.txnType === "buy" ? ["pelosi-tracker"] : [])];
  const explanation = `${item.member} (${item.chamber}) filed a STOCK Act periodic transaction report disclosing a ${item.txnType} of ${item.ticker} on ${item.txnDate.toISOString().slice(0, 10)} (disclosed ${item.disclosedDate.toISOString().slice(0, 10)}, range ${item.amountRange}).`;
  return {
    id: createHash("sha256").update(`disclosure:${item.id}`).digest("hex").slice(0, 32), canonicalUrl: `${item.filingUrl}#${item.id}`,
    title: `${surname(item.member)} disclosed ${verb} ${item.ticker} (range ${formatUsdRange(item.amountLow, item.amountHigh)})`, format: "disclosure",
    summary: `${explanation} Disclosed amounts are ranges, not exact values; filings often cover spouse or dependent trades and arrive 30–45 days after the transaction. Source: official ${item.chamber === "House" ? "House Clerk" : "Senate eFD"} filing.`,
    publisher: item.chamber === "House" ? "House Clerk PTR" : "Senate eFD PTR", publishedAt: item.disclosedDate, imageUrl: null, imageCredit: null,
    connections: bagIds.map((bagId) => ({ bagId, relationship: "direct" as const, context: item.txnType === "buy" ? "supporting" as const : item.txnType === "sell" ? "opposing" as const : "neutral" as const, explanation })),
    provenance: "editorial" as const, status: "published" as const,
  };
}

/** `bun run congress:ingest`: fetches every tracked ticker, upserts disclosures, and publishes one feed story per new disclosure. */
export async function ingestCongress() {
  let inserted = 0, storiesInserted = 0;
  const errors: string[] = [];
  for (const ticker of Object.keys(tickerToSymbol)) {
    try {
      const rows = await fetchTicker(ticker);
      for (const item of rows) {
        const result = await db.insert(congressDisclosures).values({ id: item.id, member: item.member, chamber: item.chamber, ticker: item.ticker, txnType: item.txnType, txnDate: item.txnDate, disclosedDate: item.disclosedDate,
          amountRange: item.amountRange, amountLow: item.amountLow.toFixed(2), amountHigh: item.amountHigh.toFixed(2), asset: item.asset, filingUrl: item.filingUrl, source: CONGRESS_SOURCE }).onConflictDoNothing().returning({ id: congressDisclosures.id });
        if (!result.length) continue;
        inserted++;
        // Only recent filings become feed reels; historical rows still feed the tracker bags.
        if (item.disclosedDate.getTime() < Date.now() - storyWindowDays * 864e5) continue;
        const story = disclosureStory(item);
        const published = await db.insert(stories).values(story).onConflictDoNothing().returning({ id: stories.id });
        storiesInserted += published.length;
      }
    } catch (error) { errors.push(`${ticker}: ${error instanceof Error ? error.message : "unknown failure"}`); }
  }
  return { inserted, storiesInserted, errors };
}

const midpoint = (item: { amountLow: number; amountHigh: number }) => (item.amountLow + item.amountHigh) / 2;
const evidenceOf = (item: Disclosure): Evidence => ({ kind: "disclosure", member: item.member, chamber: item.chamber, txnType: item.txnType, txnDate: item.txnDate.toISOString().slice(0, 10), disclosedDate: item.disclosedDate.toISOString().slice(0, 10), amountRange: item.amountRange, amountMidUsd: midpoint(item), url: item.filingUrl });

/** Normalises positive per-ticker scores into weightBps summing to 10000 (largest first; last absorbs rounding). */
export function toTrackerAssets(scores: Map<string, { net: number; evidence: Evidence[] }>): TrackerAsset[] {
  const positive = [...scores].filter(([, value]) => value.net > 0).sort((a, b) => b[1].net - a[1].net || a[0].localeCompare(b[0]));
  const total = positive.reduce((sum, [, value]) => sum + value.net, 0);
  if (!total) return [];
  let allocated = 0;
  return positive.map(([ticker, value], index) => {
    const weightBps = index === positive.length - 1 ? 10000 - allocated : Math.round((value.net / total) * 10000);
    allocated += weightBps;
    return { ticker, symbol: tickerToSymbol[ticker]!, name: `${tickerNames[ticker]} xStock`, weightBps, sourceUrl: value.evidence[0]?.url ?? "https://disclosures-clerk.house.gov/FinancialDisclosure", evidence: value.evidence, netUsd: value.net };
  });
}

/** Pelosi Tracker: purchases disclosed in the last 12 months by Nancy Pelosi (filings include spouse trades), amount-midpoint weighted. */
export function pelosiTracker(rows: Disclosure[], now = new Date()): TrackerAsset[] {
  const since = new Date(now.getTime() - 365 * 864e5);
  const scores = new Map<string, { net: number; evidence: Evidence[] }>();
  for (const item of rows) {
    if (!/\bpelosi\b/i.test(item.member) || item.txnType !== "buy" || item.disclosedDate < since) continue;
    const entry = scores.get(item.ticker) ?? { net: 0, evidence: [] };
    entry.net += midpoint(item); entry.evidence.push(evidenceOf(item));
    scores.set(item.ticker, entry);
  }
  return toTrackerAssets(scores);
}

/** Congress Consensus: net (buys minus sells, amount midpoints) across all members over the last 90 days of transaction dates; only net-positive tickers. */
export function congressConsensus(rows: Disclosure[], now = new Date()): TrackerAsset[] {
  const since = new Date(now.getTime() - 90 * 864e5);
  const scores = new Map<string, { net: number; evidence: Evidence[] }>();
  for (const item of rows) {
    if (item.txnDate < since || item.txnDate > now || item.txnType === "exchange") continue;
    const entry = scores.get(item.ticker) ?? { net: 0, evidence: [] };
    entry.net += (item.txnType === "buy" ? 1 : -1) * midpoint(item); entry.evidence.push(evidenceOf(item));
    scores.set(item.ticker, entry);
  }
  return toTrackerAssets(scores);
}

let cache: { rows: Disclosure[]; expiresAt: number } | null = null;
/** Disclosures for tracked tickers from the local DB (cached 5 minutes; empty on DB failure). */
export async function loadDisclosures(): Promise<Disclosure[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;
  try {
    const since = new Date(Date.now() - 400 * 864e5);
    const rows = await db.select().from(congressDisclosures).where(and(inArray(congressDisclosures.ticker, Object.keys(tickerToSymbol)), gte(congressDisclosures.disclosedDate, since), lte(congressDisclosures.txnDate, new Date()))).orderBy(desc(congressDisclosures.disclosedDate)).limit(2000);
    const parsed = rows.map((row) => ({ id: row.id, member: row.member, chamber: row.chamber as "House" | "Senate", ticker: row.ticker, txnType: row.txnType as "buy" | "sell" | "exchange", txnDate: row.txnDate, disclosedDate: row.disclosedDate, amountRange: row.amountRange, amountLow: Number(row.amountLow), amountHigh: Number(row.amountHigh), asset: row.asset, filingUrl: row.filingUrl }));
    cache = { rows: parsed, expiresAt: Date.now() + 5 * 60 * 1000 };
    return parsed;
  } catch { return cache?.rows ?? []; }
}
export function resetCongressCache() { cache = null; }
