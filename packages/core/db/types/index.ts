import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users } from "../schema";

// Users
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
