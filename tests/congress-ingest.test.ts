import { afterEach, expect, it, mock } from "bun:test";
import { getTableName, type Table } from "drizzle-orm";

const inserts: { table: string; values: { id: string }[] }[] = [];
const existing = new Set<string>();
mock.module("@newsbid/core/db", () => ({ db: {
  insert: (table: Table) => ({ values: (values: { id: string }[]) => ({ onConflictDoNothing: () => ({ returning: async () => {
    inserts.push({ table: getTableName(table), values });
    const added = values.filter((value) => !existing.has(value.id));
    for (const value of added) existing.add(value.id);
    return added.map(({ id }) => ({ id }));
  } }) }) }),
} }));
const { ingestCongress, tickerToSymbol } = await import("../apps/api/src/lib/congress");
const cron = (await import("../apps/api/congress-cron")).default;
const tickers = Object.keys(tickerToSymbol);
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; inserts.length = 0; existing.clear(); });

const day = (offset: number) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
const trade = (ticker: string, extra: Record<string, unknown> = {}) => ({ member: "Nancy Pelosi", chamber: "House", trade_type: "buy", amount: "$15,001 - $50,000", tx_date: day(20), disclosed: day(10),
  asset: `${ticker} [ST]`, ticker, link: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/${ticker}.pdf`, ...extra });
const serve = (trades: (ticker: string) => unknown[]) => {
  const calls: string[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    const ticker = decodeURIComponent(String(url).match(/\/trades\/([^?]+)/)![1]!);
    calls.push(ticker);
    return Response.json({ trades: trades(ticker) });
  }) as unknown as typeof fetch;
  return calls;
};

it("batches one disclosure insert per ticker, deduplicates, and only turns new recent filings into stories", async () => {
  const calls = serve((ticker) => ticker === "NVDA"
    ? [trade(ticker), trade(ticker), trade(ticker, { disclosed: day(300), tx_date: day(310) }), trade("AAPL")]
    : []);
  const first = await ingestCongress();
  expect(calls).toEqual(tickers);
  expect(first).toEqual({ inserted: 2, storiesInserted: 1, errors: [] });
  expect(inserts.map((insert) => [insert.table, insert.values.length])).toEqual([["congress_disclosures", 2], ["stories", 1]]);

  inserts.length = 0;
  expect(await ingestCongress()).toEqual({ inserted: 0, storiesInserted: 0, errors: [] });
  expect(inserts.map((insert) => insert.table)).toEqual(["congress_disclosures"]);
});

it("cron logs partial failures but fails the invocation when every ticker fails", async () => {
  serve((ticker) => { if (ticker !== "MSFT") throw new Error("rate limited"); return [trade(ticker)]; });
  await cron.scheduled();
  expect(inserts.map((insert) => [insert.table, insert.values.length])).toEqual([["congress_disclosures", 1], ["stories", 1]]);

  globalThis.fetch = mock(async () => new Response("Too Many Requests", { status: 429 })) as unknown as typeof fetch;
  await expect(cron.scheduled()).rejects.toThrow("Congress ingest failed for every ticker: AAPL: CongressInvests 429 for AAPL");
});
