import { afterEach, expect, it, mock } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const rows: Record<string, unknown>[] = [];
const writes: unknown[] = [];
const predicates: string[] = [];
let selectedLimit = 0;
let claimWon = true;
const dialect = new PgDialect();
mock.module("@stockpile/core/db", () => ({ db: {
  select: () => ({ from: () => ({ where: (condition: SQL) => {
    predicates.push(dialect.sqlToQuery(condition).sql);
    return { orderBy: () => ({ limit: async (limit: number) => { selectedLimit = limit; return rows.slice(0, limit); } }) };
  } }) }),
  update: () => ({ set: (value: unknown) => ({ where: () => {
    writes.push(value);
    return { returning: async () => claimWon ? [{ id: "story" }] : [] };
  } }) }),
} }));
const { reanalyzeStories } = await import("../apps/api/src/lib/story-ingest");
const { setSecrets, resetConfig } = await import("../apps/api/src/lib/config");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; resetConfig(); rows.length = 0; writes.length = 0; predicates.length = 0; selectedLimit = 0; claimWon = true; });
const row = () => ({
  id: "story", canonicalUrl: "https://blogs.microsoft.com/example", title: "Microsoft faces community requests",
  format: "article", publisher: "Microsoft Blog", publishedAt: new Date("2026-09-29T00:00:00Z"),
  summary: "An old summary is not evidence", status: "published", provenance: "editorial",
  connections: [{ bagId: "megacap-builders", relationship: "direct", context: "neutral", explanation: "old explanation",
    sourceCompany: "Microsoft", sourceExcerpt: "Microsoft has received a request for community contributions." }],
});

it("scheduled selection filters missing/due/unexhausted rows before a five-row cap", async () => {
  setSecrets({ OpenaiApiKey: "test-key" });
  await reanalyzeStories({ apply: false, scheduled: true, limit: 200 });
  expect(selectedLimit).toBe(5);
  expect(predicates[0]).toContain("jsonb_array_elements");
  expect(predicates[0]).toContain("'analysis' = 'null'::jsonb");
  expect(predicates[0]).toContain("'attempts')::int, 0) < 3");
  expect(predicates[0]).toContain("<= now()");
});

it("missing cron credentials defer without querying, fetching or consuming retries", async () => {
  setSecrets({ OpenaiApiKey: undefined });
  const calls = mock(async () => { throw new Error("No network"); });
  globalThis.fetch = calls as unknown as typeof fetch;
  const result = await reanalyzeStories({ apply: true, scheduled: true, limit: 5 });
  expect(result.errors[0]).toContain("without consuming retries");
  expect(predicates).toHaveLength(0);
  expect(writes).toHaveLength(0);
  expect(calls).toHaveBeenCalledTimes(0);
});

it("scheduled failures persist a retry claim but preserve the original explanation", async () => {
  rows.push(row());
  setSecrets({ OpenaiApiKey: "test-key" });
  globalThis.fetch = mock(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
  await reanalyzeStories({ apply: true, scheduled: true, limit: 5 });
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ connections: [{ explanation: "old explanation", analysisRetry: { attempts: 1 } }] });
  const next = (writes[0] as { connections: { analysisRetry: { nextAttemptAt: string } }[] }).connections[0]!.analysisRetry.nextAttemptAt;
  expect(new Date(next).getTime() - Date.now()).toBeGreaterThan(5.9 * 60 * 60_000);
});

it("a lost atomic claim makes no paid call", async () => {
  rows.push(row());
  claimWon = false;
  setSecrets({ OpenaiApiKey: "test-key" });
  const calls = mock(async () => { throw new Error("No duplicate model call"); });
  globalThis.fetch = calls as unknown as typeof fetch;
  expect(await reanalyzeStories({ apply: true, scheduled: true, limit: 5 })).toMatchObject({ updated: 0 });
  expect(calls).toHaveBeenCalledTimes(0);
});

it("successful unchanged records never call the model", async () => {
  rows.push({ ...row(), connections: [{ ...row().connections[0], analysis: { version: 1 } }] });
  setSecrets({ OpenaiApiKey: "test-key" });
  const calls = mock(async () => { throw new Error("No successful-row reanalysis"); });
  globalThis.fetch = calls as unknown as typeof fetch;
  expect(await reanalyzeStories({ apply: true, scheduled: true, limit: 5 })).toMatchObject({ candidates: [], updated: 0 });
  expect(writes).toHaveLength(0);
  expect(calls).toHaveBeenCalledTimes(0);
});

it("dry run makes no HTTP/AI calls or writes and lists candidates", async () => {
  rows.push(row());
  const calls = mock(async () => { throw new Error("No HTTP in dry run"); });
  globalThis.fetch = calls as unknown as typeof fetch;
  expect(await reanalyzeStories({ apply: false, limit: 20 })).toMatchObject({ updated: 0, candidates: ["story"] });
  expect(calls).toHaveBeenCalledTimes(0);
  expect(writes).toHaveLength(0);
});

it("failed reanalysis preserves existing records", async () => {
  rows.push(row());
  setSecrets({ OpenaiApiKey: "test-key" });
  globalThis.fetch = mock(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
  expect(await reanalyzeStories({ apply: true, limit: 20 })).toMatchObject({ updated: 0, unavailable: [{ id: "story", reason: "provider_failure" }] });
  expect(writes).toHaveLength(0);
});

it("never uses an old summary when a legacy excerpt cannot be recovered", async () => {
  const legacy = row();
  rows.push({ ...legacy, connections: legacy.connections.map(({ sourceExcerpt, sourceCompany, ...connection }) => connection) });
  setSecrets({ OpenaiApiKey: "test-key" });
  const calls = mock(async (url: string | URL | Request) => {
    expect(String(url)).not.toContain("api.openai.com");
    return new Response("source unavailable", { status: 503 });
  });
  globalThis.fetch = calls as unknown as typeof fetch;
  const result = await reanalyzeStories({ apply: true, limit: 20 });
  expect(result.unavailable[0]?.reason).toContain("Original publisher excerpt");
  expect(writes).toHaveLength(0);
});

it("explicit apply writes validated analysis from the saved excerpt, not the old summary", async () => {
  rows.push(row());
  setSecrets({ OpenaiApiKey: "test-key" });
  globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    const input = JSON.parse(JSON.parse(String(init?.body)).input);
    expect(input.excerpt).toBe(row().connections[0]!.sourceExcerpt);
    expect(JSON.stringify(input)).not.toContain("An old summary");
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({
      summary: "The publisher reports Microsoft received a request for community contributions.",
      connections: [{ bagId: "megacap-builders", relationship: "direct", analysis: {
        direction: "unclear", headline: "Community requests create an unresolved cost question",
        whatHappened: "Microsoft received a community contribution request.", businessImpact: "Accepting the request could add costs to expansion.",
        bagImplication: "Microsoft's growth plans could face an additional cost if it agrees.",
        uncertainty: "The excerpt does not give terms, amounts or an agreement.", watch: "Watch for Microsoft's response to the request.",
        evidence: input.excerpt, affectedSymbols: ["MSFTx"],
      } }],
    }) }] }] });
  }) as unknown as typeof fetch;
  expect(await reanalyzeStories({ apply: true, limit: 20 })).toMatchObject({ updated: 1, unavailable: [] });
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ provenance: "ai", connections: [{ analysis: { model: "gpt-6-luna" } }] });
});

it("cron continues pending analysis after feed failures and caps paid attempts at five", async () => {
  for (let i = 0; i < 8; i++) rows.push({ ...row(), id: `story-${i}` });
  setSecrets({ OpenaiApiKey: "test-key" });
  let modelCalls = 0;
  let feedCalls = 0;
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    if (String(url).includes("api.openai.com")) modelCalls++;
    else feedCalls++;
    return new Response("unavailable", { status: 503 });
  }) as unknown as typeof fetch;
  const cron = (await import("../apps/api/stories-cron")).default;
  await cron.scheduled();
  expect(feedCalls).toBe(12);
  expect(modelCalls).toBe(5);
  expect(writes).toHaveLength(5);
});

it("later failed attempts use a 24-hour cooldown and retain the attempt count", async () => {
  rows.push({ ...row(), connections: [{ ...row().connections[0], analysisRetry: { attempts: 2, nextAttemptAt: new Date(0).toISOString() } }] });
  setSecrets({ OpenaiApiKey: "test-key" });
  globalThis.fetch = mock(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
  await reanalyzeStories({ apply: true, scheduled: true, limit: 5 });
  expect(writes[0]).toMatchObject({ connections: [{ analysisRetry: { attempts: 3 } }] });
  const next = (writes[0] as { connections: { analysisRetry: { nextAttemptAt: string } }[] }).connections[0]!.analysisRetry.nextAttemptAt;
  expect(new Date(next).getTime() - Date.now()).toBeGreaterThan(23.9 * 60 * 60_000);
});
