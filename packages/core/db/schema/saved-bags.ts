import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const savedBags = pgTable("saved_bags", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bagId: text("bag_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.bagId] })]);
