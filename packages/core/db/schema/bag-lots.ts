import { bigint, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * One confirmed on-chain swap leg attributed to a bag by the user. Amounts are base units as decimal strings, derived by the
 * API from the transaction's pre/post token balances (never from the client). `signature` is unique so a leg can only ever
 * belong to one bag.
 */
export const bagLots = pgTable("bag_lots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bagId: text("bag_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  mint: text("mint").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side", { enum: ["buy", "sell"] }).notNull(),
  tokenAmount: text("token_amount").notNull(),
  decimals: integer("decimals").notNull(),
  usdcAmount: text("usdc_amount").notNull(),
  signature: text("signature").notNull().unique(),
  slot: bigint("slot", { mode: "number" }),
  blockTime: timestamp("block_time", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("bag_lots_user_bag_idx").on(table.userId, table.bagId)]);
