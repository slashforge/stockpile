import { afterEach, expect, it, mock } from "bun:test";
import { getTableName, type Table } from "drizzle-orm";

type Row = Record<string, unknown> & { url?: string; id?: string };
const tables = new Map<string, Map<string, Row>>([["cramer_articles", new Map()], ["cramer_calls", new Map()]]);
const keyOf = (table: string, row: Row) => String(table === "cramer_articles" ? row.url : row.id);
mock.module("@newsbid/core/db", () => ({ db: {
  select: () => ({ from: (table: Table) => ({ where: async () => [...tables.get(getTableName(table))!.values()] }) }),
  insert: (table: Table) => ({ values: (value: Row | Row[]) => {
    const name = getTableName(table);
    const rows = Array.isArray(value) ? value : [value];
    return {
      onConflictDoNothing: async () => { for (const row of rows) if (!tables.get(name)!.has(keyOf(name, row))) tables.get(name)!.set(keyOf(name, row), row); },
      onConflictDoUpdate: async ({ set }: { set: Row }) => { for (const row of rows) tables.get(name)!.set(keyOf(name, row), { ...tables.get(name)!.get(keyOf(name, row)), ...row, ...set }); },
    };
  } }),
} }));
const { ingestCramer, MAD_MONEY_FEED } = await import("../apps/api/src/lib/cramer");
const { setSecrets, resetConfig } = await import("../apps/api/src/lib/config");
const cron = (await import("../apps/api/cramer-cron")).default;
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; resetConfig(); for (const table of tables.values()) table.clear(); });

const lightning = "https://www.cnbc.com/2026/10/15/cramers-lightning-round-sell-tesla.html";
const guide = "https://www.cnbc.com/2026/10/16/jim-cramer-guide-to-investing.html";
const feed = `<rss><channel>${[[lightning, "Cramer's lightning round: Sell Tesla"], [guide, "Jim Cramer's guide to investing"]].map(([link, title]) =>
  `<item><link>${link}</link><title>${title}</title><pubDate>Thu, 15 Oct 2026 22:55:01 GMT</pubDate></item>`).join("")}</channel></rss>`;
const page = (body: string) => `<html><div class="ArticleBody-articleBody">${body}</div></html>`;
const pages: Record<string, string> = {
  [lightning]: page(`<p><a href="/quotes/TSLA/">Tesla</a>: "I'm not recommending it. Sell it."</p><p><a href="/quotes/NVDA/">Nvidia</a>: "Buy, buy, buy. It's the best."</p>`),
  [guide]: page("<p>Cramer explains how to use the new high list without naming any company at all.</p>"),
};
function serve(model: () => Response) {
  const calls = { feed: 0, pages: 0, model: 0, userAgents: new Set<string>() };
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api.openai.com")) { calls.model++; return model(); }
    calls.userAgents.add((init?.headers as Record<string, string>)["User-Agent"] ?? "");
    if (url === MAD_MONEY_FEED) { calls.feed++; return new Response(feed, { headers: { "content-type": "text/html" } }); }
    calls.pages++;
    return pages[url] ? new Response(pages[url]) : new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
  return calls;
}
const completed = (calls: unknown) => Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ calls }) }] }] });

it("classifies only articles that link tradable tickers, stores verified calls once, and skips examined articles next run", async () => {
  setSecrets({ OpenaiApiKey: "test-key" });
  const calls = serve(() => completed([{ ticker: "TSLA", stance: "bearish", quote: "I'm not recommending it. Sell it." }, { ticker: "NVDA", stance: "bullish", quote: "Buy, buy, buy." }]));
  expect(await ingestCramer()).toMatchObject({ examined: 2, classified: 1, withoutTickers: 1, failed: 0, calls: 2, errors: [] });
  expect(calls).toMatchObject({ feed: 1, pages: 2, model: 1 });
  expect([...calls.userAgents]).toEqual(["Newsbid/1.0 (+https://newsbid.trade)"]);
  expect([...tables.get("cramer_calls")!.values()].map((row) => [row.ticker, row.stance, row.quote, row.articleUrl])).toEqual([
    ["TSLA", "bearish", "I'm not recommending it. Sell it.", lightning], ["NVDA", "bullish", "Buy, buy, buy.", lightning]]);
  expect([...tables.get("cramer_articles")!.values()].map((row) => [row.url, row.status, row.attempts])).toEqual([[lightning, "done", 1], [guide, "no_calls", 1]]);

  expect(await ingestCramer()).toMatchObject({ examined: 0, calls: 0 });
  expect(calls).toMatchObject({ feed: 2, pages: 2, model: 1 });
});

it("retries failed classifications up to three attempts and defers without a key", async () => {
  setSecrets({ OpenaiApiKey: undefined });
  const calls = serve(() => completed([]));
  expect(await ingestCramer()).toMatchObject({ classified: 0, deferred: 1, failed: 0 });
  expect(tables.get("cramer_articles")!.get(lightning)).toBeUndefined();

  setSecrets({ OpenaiApiKey: "test-key" });
  serve(() => completed([{ ticker: "AAPL", stance: "bearish", quote: "Sell it." }]));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await ingestCramer();
    expect(result).toMatchObject({ failed: 1 });
    expect(result.errors[0]).toContain("classification invalid_output");
    expect(tables.get("cramer_articles")!.get(lightning)).toMatchObject({ status: "failed", attempts: attempt });
  }
  expect(await ingestCramer()).toMatchObject({ examined: 0 });
  expect(calls.model).toBe(0);
});

it("dry runs touch no tables and return a preview", async () => {
  setSecrets({ OpenaiApiKey: "test-key" });
  serve(() => completed([{ ticker: "TSLA", stance: "bearish", quote: "Sell it." }]));
  const result = await ingestCramer({ dryRun: true });
  expect(result.preview?.map((call) => [call.ticker, call.stance])).toEqual([["TSLA", "bearish"]]);
  expect(tables.get("cramer_calls")!.size + tables.get("cramer_articles")!.size).toBe(0);
});

it("cron fails the invocation when the feed is down or every examined article failed", async () => {
  globalThis.fetch = mock(async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
  await expect(cron.scheduled()).rejects.toThrow("Cramer ingest failed: feed:");
  setSecrets({ OpenaiApiKey: "test-key" });
  serve(() => new Response("overloaded", { status: 529 }));
  pages[guide] = page(`<p><a href="/quotes/AAPL/">Apple</a> came up in this article about investing guides.</p>`);
  await expect(cron.scheduled()).rejects.toThrow("classification provider_failure");
});
