import { pgTable, text, timestamp, varchar, index } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    wallet: text("wallet").notNull().unique(),
    username: text("username").unique(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_wallet_idx").on(table.wallet),
  ]
);
