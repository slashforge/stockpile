import { index, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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
