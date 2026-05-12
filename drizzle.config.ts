import { Resource } from "sst";
import { defineConfig } from "drizzle-kit";

const resources = Resource as unknown as Record<string, { value?: string }>;

export default defineConfig({
  dialect: "postgresql",
  schema: ["./packages/core/db/schema"],
  dbCredentials: {
    url: resources.DatabaseUrl?.value ?? process.env.DATABASE_URL!,
  },
});
