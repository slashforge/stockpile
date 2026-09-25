import { expect, it } from "bun:test";
import { app } from "../../apps/api/src/app";

it("serves persisted, paginated, source-attributed story and podcast feeds", async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const first = await app.request("/stories?limit=4");
  expect(first.status).toBe(200);
  const feed = await first.json() as { stories: { id: string; sourceUrl: string; publishedAt: string; imageUrl: null; provenance: string; bagIds: string[] }[]; nextCursor: string | null };
  expect(feed.stories).toHaveLength(4);
  expect(feed.nextCursor).toBeTruthy();
  expect(feed.stories.every((story) => story.sourceUrl.startsWith("https://") && story.imageUrl === null && story.provenance === "editorial" && story.bagIds.length > 0)).toBe(true);
  const next = await (await app.request(`/stories?limit=4&cursor=${feed.nextCursor}`)).json() as typeof feed;
  expect(next.stories).toHaveLength(4);
  expect(new Set([...feed.stories, ...next.stories].map((story) => story.id)).size).toBe(8);
  expect((await app.request("/stories?cursor=00000000000000000000000000000000")).status).toBe(400);
  const podcasts = await (await app.request("/stories?format=podcast&limit=5")).json() as { stories: { format: string; sourceUrl: string }[] };
  expect(podcasts.stories.length).toBeGreaterThan(0);
  expect(podcasts.stories.every((story) => story.format === "podcast" && story.sourceUrl.startsWith("https://podcasts.apple.com/"))).toBe(true);
  const related = await (await app.request("/bags/consumer-frontiers/stories?limit=5")).json() as { stories: { bagIds: string[] }[] };
  expect(related.stories.length).toBeGreaterThan(0);
  expect(related.stories.every((story) => story.bagIds.includes("consumer-frontiers"))).toBe(true);
});
