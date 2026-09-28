/**
 * Story feed, backed by the generated SDK (`listStories`, `listBagStories`; see
 * docs/api-contract.md). Types come straight from the generated contract.
 */
import { listBagStories, listStories, type Story, type StoryBagConnection } from "./client";
import { ApiError, unwrap } from "./stockpile";

export type { Story };
export type StoryConnection = StoryBagConnection;

export type StoryPage = { stories: Story[]; nextCursor: string | null };

export type StoriesResult =
  | ({ status: "live" } & StoryPage)
  | { status: "unavailable"; message: string };

const PAGE_SIZE = 10;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
};

/** Publisher feeds sometimes leak HTML entities (`&#8216;`, `&amp;`) into titles; show the characters. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function cleanStory(story: Story): Story {
  return {
    ...story,
    title: decodeEntities(story.title),
    summary: decodeEntities(story.summary),
    publisher: decodeEntities(story.publisher),
  };
}

async function asResult(call: Promise<StoryPage>, unavailableMessage: string): Promise<StoriesResult> {
  try {
    const page = await call;
    return { status: "live", stories: page.stories.map(cleanStory), nextCursor: page.nextCursor };
  } catch (error) {
    // A server without the stories routes answers 404; report that honestly instead of failing.
    if (error instanceof ApiError && error.isNotFound) return { status: "unavailable", message: unavailableMessage };
    throw error;
  }
}

export function fetchStories(cursor?: string | null): Promise<StoriesResult> {
  return asResult(
    unwrap(listStories({ query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } })),
    "This server doesn't publish stories yet.",
  );
}

export function fetchBagStories(bagId: string, cursor?: string | null): Promise<StoriesResult> {
  return asResult(
    unwrap(listBagStories({ path: { id: bagId }, query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } })),
    "Stories aren't available for this bag yet.",
  );
}

/** The connection describing how a story relates to a given bag, if any. */
export function connectionFor(story: Story, bagId: string): StoryConnection | undefined {
  return story.bagConnections.find((connection) => connection.bagId === bagId);
}

/**
 * Bags a story relates to, in the order the API lists them. Unions `bagIds` with the bag ids in
 * `bagConnections` so a story with a connection is never shown without its bag; ids for bags the
 * app hasn't loaded are skipped.
 */
export function relatedBags<B extends { id: string }>(story: Story, bagsById: ReadonlyMap<string, B>): B[] {
  const ids = [...story.bagIds, ...story.bagConnections.map((connection) => connection.bagId)];
  const seen = new Set<string>();
  const result: B[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const bag = bagsById.get(id);
    if (bag) result.push(bag);
  }
  return result;
}
