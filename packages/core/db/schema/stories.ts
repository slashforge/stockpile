import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type StoryConnection = {
  bagId: string;
  relationship: "direct" | "inferred";
  context: "supporting" | "opposing" | "neutral";
  explanation: string;
};

export const stories = pgTable("stories", {
  id: text("id").primaryKey(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  title: text("title").notNull(),
  format: text("format").notNull().default("article"),
  summary: text("summary").notNull(),
  publisher: text("publisher").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  imageUrl: text("image_url"),
  imageCredit: text("image_credit"),
  connections: jsonb("connections").$type<StoryConnection[]>().notNull(),
  provenance: text("provenance").notNull(),
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("stories_published_id_idx").on(table.publishedAt, table.id)]);
