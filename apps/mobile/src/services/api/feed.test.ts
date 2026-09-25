/// <reference types="bun" />
import { afterEach, expect, test } from "bun:test";
import { fetchBagStories, fetchStories } from "./feed";

const realFetch = globalThis.fetch;
let urls: string[] = [];

function mockFetch(respond: () => Response) {
  urls = [];
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    urls.push(request.url);
    return respond();
  }) as typeof fetch;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("fetchStories returns a live page and passes the cursor", async () => {
  mockFetch(() => json(200, { stories: [], nextCursor: "abc" }));
  const result = await fetchStories("prev");
  expect(result).toEqual({ status: "live", stories: [], nextCursor: "abc" });
  expect(urls[0]).toContain("/stories?");
  expect(urls[0]).toContain("cursor=prev");
  expect(urls[0]).toContain("limit=10");
});

test("a server without story routes (404) is reported as unavailable, not an error", async () => {
  mockFetch(() => new Response("404 Not Found", { status: 404 }));
  const result = await fetchStories();
  expect(result.status).toBe("unavailable");
});

test("other failures surface as errors", async () => {
  mockFetch(() => json(400, { error: "Invalid cursor" }));
  await expect(fetchStories("bad")).rejects.toThrow("Invalid cursor");
});

test("fetchBagStories targets the bag", async () => {
  mockFetch(() => json(200, { stories: [], nextCursor: null }));
  await fetchBagStories("ai-infrastructure");
  expect(urls[0]).toContain("/bags/ai-infrastructure/stories");
});
