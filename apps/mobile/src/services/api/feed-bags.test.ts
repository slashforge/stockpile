/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { relatedBags, type Story } from "./feed";

// Mirrors a live GET /stories item (field names from the generated SDK / docs/api-contract.md).
const liveStory: Story = {
  id: "bd8f9dfa50ec22b135ae0c19fefb998c",
  title: "Example",
  format: "article",
  summary: "s",
  publisher: "Google Blog",
  sourceUrl: "https://blog.google/",
  publishedAt: "2026-09-24T17:00:00.000Z",
  imageUrl: null,
  imageCredit: null,
  bagIds: ["ai-infrastructure"],
  bagConnections: [
    { bagId: "ai-infrastructure", relationship: "direct", context: "neutral", explanation: "Mentioned." },
  ],
  provenance: "editorial",
  status: "published",
};

const bags = new Map([
  ["ai-infrastructure", { id: "ai-infrastructure", title: "AI Infrastructure" }],
  ["megacap-builders", { id: "megacap-builders", title: "Megacap Builders" }],
]);

describe("relatedBags", () => {
  test("a story with a bag relationship always yields its bag", () => {
    expect(relatedBags(liveStory, bags).map((bag) => bag.id)).toEqual(["ai-infrastructure"]);
  });

  test("uses bagConnections even when bagIds is empty", () => {
    const story = { ...liveStory, bagIds: [], bagConnections: [{ ...liveStory.bagConnections[0], bagId: "megacap-builders" }] };
    expect(relatedBags(story, bags).map((bag) => bag.id)).toEqual(["megacap-builders"]);
  });

  test("keeps API order, dedupes, and skips bags the app hasn't loaded", () => {
    const story = {
      ...liveStory,
      bagIds: ["megacap-builders", "unknown", "ai-infrastructure"],
      bagConnections: [{ ...liveStory.bagConnections[0], bagId: "megacap-builders" }],
    };
    expect(relatedBags(story, bags).map((bag) => bag.id)).toEqual(["megacap-builders", "ai-infrastructure"]);
  });

  test("a story with no relationships yields no bags", () => {
    expect(relatedBags({ ...liveStory, bagIds: [], bagConnections: [] }, bags)).toEqual([]);
  });
});
