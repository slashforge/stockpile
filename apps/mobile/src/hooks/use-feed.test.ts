/// <reference types="bun" />
import { expect, test } from "bun:test";
import type { Story } from "@/services/api/feed";
import { collectStories } from "./use-feed";

const story = (id: string): Story => ({
  id,
  title: `t${id}`,
  format: "article",
  summary: "s",
  publisher: "p",
  sourceUrl: "https://example.com",
  publishedAt: "2026-01-01T00:00:00Z",
  imageUrl: null,
  imageCredit: null,
  bagIds: [],
  bagConnections: [],
  provenance: "editorial",
  status: "published",
});

test("collectStories flattens and dedupes pages", () => {
  const result = collectStories([
    { status: "live", stories: [story("a"), story("b")], nextCursor: "b" },
    { status: "live", stories: [story("b"), story("c")], nextCursor: null },
  ]);
  expect(result.status).toBe("live");
  if (result.status === "live") expect(result.stories.map((s) => s.id)).toEqual(["a", "b", "c"]);
});

test("collectStories reports unavailable honestly", () => {
  expect(collectStories([{ status: "unavailable", message: "nope" }])).toEqual({ status: "unavailable", message: "nope" });
  expect(collectStories(undefined)).toEqual({ status: "pending" });
});
