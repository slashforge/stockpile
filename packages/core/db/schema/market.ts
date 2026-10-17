import { index, integer, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const priceSnapshots = pgTable("price_snapshots", {
  mint: text("mint").notNull(),
  usdPrice: numeric("usd_price", { precision: 20, scale: 8 }).notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.mint, table.ts] }), index("price_snapshots_ts_idx").on(table.ts)]);

export const congressDisclosures = pgTable("congress_disclosures", {
  id: text("id").primaryKey(),
  member: text("member").notNull(),
  chamber: text("chamber").notNull(),
  ticker: text("ticker").notNull(),
  txnType: text("txn_type").notNull(),
  txnDate: timestamp("txn_date", { withTimezone: true }).notNull(),
  disclosedDate: timestamp("disclosed_date", { withTimezone: true }).notNull(),
  amountRange: text("amount_range").notNull(),
  amountLow: numeric("amount_low", { precision: 16, scale: 2 }).notNull(),
  amountHigh: numeric("amount_high", { precision: 16, scale: 2 }).notNull(),
  asset: text("asset").notNull(),
  filingUrl: text("filing_url").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("congress_disclosures_ticker_txn_idx").on(table.ticker, table.txnDate), index("congress_disclosures_member_idx").on(table.member)]);

/** CNBC Mad Money articles already examined for Jim Cramer calls (one row per article URL, including ones with no calls). */
export const cramerArticles = pgTable("cramer_articles", {
  url: text("url").primaryKey(),
  title: text("title").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("cramer_articles_published_idx").on(table.publishedAt)]);

/** One classified stance per (article, ticker); feeds the inverse-cramer tracker bag. */
export const cramerCalls = pgTable("cramer_calls", {
  id: text("id").primaryKey(),
  articleUrl: text("article_url").notNull(),
  ticker: text("ticker").notNull(),
  stance: text("stance").notNull(),
  saidAt: timestamp("said_at", { withTimezone: true }).notNull(),
  title: text("title").notNull(),
  quote: text("quote").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("cramer_calls_said_idx").on(table.saidAt), index("cramer_calls_ticker_idx").on(table.ticker, table.saidAt)]);
