import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@stockpile/core/db";
import { stories } from "@stockpile/core/db/schema";

export async function listStories(limit: number, cursor?: string, bagId?: string, format?: "article" | "podcast" | "disclosure") {
  const match = bagId ? sql`${stories.connections} @> ${JSON.stringify([{ bagId }])}::jsonb` : undefined;
  let before;
  if (cursor) {
    const [row] = await db.select({ id: stories.id, publishedAt: stories.publishedAt }).from(stories).where(eq(stories.id, cursor)).limit(1);
    if (!row) return null;
    before = or(lt(stories.publishedAt, row.publishedAt), and(eq(stories.publishedAt, row.publishedAt), lt(stories.id, row.id)));
  }
  const rows = await db.select().from(stories).where(and(eq(stories.status, "published"), format ? eq(stories.format, format) : undefined, match, before))
    .orderBy(desc(stories.publishedAt), desc(stories.id)).limit(limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  return { stories: page.map((row) => ({ id: row.id, title: row.title, format: row.format === "podcast" ? "podcast" as const : row.format === "disclosure" ? "disclosure" as const : "article" as const, summary: row.summary, publisher: row.publisher,
    sourceUrl: row.canonicalUrl, publishedAt: row.publishedAt.toISOString(), imageUrl: row.imageUrl, imageCredit: row.imageCredit,
    bagIds: row.connections.map((connection) => connection.bagId), bagConnections: row.connections,
    provenance: row.provenance === "ai" ? "ai" as const : "editorial" as const, status: "published" as const })),
    nextCursor: more ? page.at(-1)!.id : null };
}
