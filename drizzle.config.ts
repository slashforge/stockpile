import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./packages/core/db/schema"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? (() => { throw new Error("DATABASE_URL is required in root .env"); })(),
  },
});
