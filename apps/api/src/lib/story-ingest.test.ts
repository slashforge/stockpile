import { expect, it } from "bun:test";
import { companies, matchCompanies, parseFeed, parsePodcastEpisodes } from "./story-ingest";

const source = { publisher: "Microsoft Official Blog", company: "Microsoft", host: "blogs.microsoft.com", url: "https://blogs.microsoft.com/feed/", bags: ["megacap-builders", "ai-infrastructure"] } as const;
it("parses and deduplicates only canonical approved publisher URLs and preserves source date", () => {
  const item = (url: string) => `<item><title>Microsoft announces a new research update</title><link>${url}</link><description>Microsoft announced an update to its research platform for users.</description><pubDate>Thu, 17 Sep 2026 14:00:05 +0000</pubDate></item>`;
  const stories = parseFeed(`<rss><channel>${item("https://blogs.microsoft.com/blog/example/?utm_source=rss")}${item("https://blogs.microsoft.com/blog/example/")}${item("https://evil.example/blog/example/")}</channel></rss>`, source);
  expect(stories).toHaveLength(1);
  expect(stories[0]?.canonicalUrl).toBe("https://blogs.microsoft.com/blog/example/");
  expect(stories[0]?.publishedAt.toISOString()).toBe("2026-09-17T14:00:05.000Z");
});
it("accepts only NVIDIA's identified show and canonical episode deep links", () => {
  const show = { wrapperType: "track", collectionId: 1186480811, artistName: "NVIDIA", trackName: "NVIDIA AI Podcast" };
  const episode = { wrapperType: "podcastEpisode", collectionName: "NVIDIA AI Podcast", collectionId: 1186480811,
    trackName: "A new NVIDIA AI Podcast episode for researchers", description: "Researchers discuss new computing methods and what they mean for scientific research.",
    releaseDate: "2026-06-24T15:45:00Z", trackViewUrl: "https://podcasts.apple.com/us/podcast/a-new-episode/id1186480811?i=1000774058193" };
  expect(parsePodcastEpisodes({ results: [show, episode] })[0]).toMatchObject({ format: "podcast", publisher: "NVIDIA AI Podcast" });
  expect(parsePodcastEpisodes({ results: [episode] })).toEqual([]);
  expect(parsePodcastEpisodes({ results: [show, { ...episode, trackViewUrl: "https://evil.example/episode" }] })).toEqual([]);
});
it("rejects XML entity declarations and articles without truthful publication dates", () => {
  expect(() => parseFeed("<!DOCTYPE rss [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><rss/>", source)).toThrow();
  expect(parseFeed("<rss><channel><item><title>Microsoft announces a new update</title><link>https://blogs.microsoft.com/blog/example/</link><description>Relevant and attributed source excerpt goes here.</description></item></channel></rss>", source)).toEqual([]);
});
it("keeps only explicit company mentions from multi-company press feeds and maps them to pre-IPO bags", () => {
  const press = { publisher: "TechCrunch AI", host: "techcrunch.com", url: "https://techcrunch.com/category/artificial-intelligence/feed/", companies } as const;
  const item = (slug: string, title: string, body: string) => `<item><title>${title}</title><link>https://techcrunch.com/2026/09/25/${slug}/</link><description>${body}</description><pubDate>Thu, 24 Sep 2026 14:00:05 +0000</pubDate></item>`;
  const stories = parseFeed(`<rss><channel>${item("openai", "OpenAI and Anthropic race on new models", "Both labs shipped updates this week, analysts said.")}${item("markets", "Kalshi expands event contracts", "The prediction market added new categories for traders.")}${item("none", "A generic gadget review roundup", "Nothing about any covered company appears in this excerpt at all.")}${item("space", "Starlink adds capacity", "SpaceX launched more satellites for its broadband constellation.")}</channel></rss>`, press);
  expect(stories.map((story) => [story.company, story.bagIds])).toEqual([["OpenAI", ["frontier-ai-labs"]], ["Kalshi", ["prediction-markets"]], ["SpaceX", ["defense-space"]]]);
  expect(matchCompanies("Polymarket and Anduril in one headline").map((company) => company.name)).toEqual(["Polymarket", "Anduril"]);
  expect(matchCompanies("Amd lowercase is not the ticker; Figure AI is").map((company) => company.name)).toEqual(["Figure AI"]);
});
