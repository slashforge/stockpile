import { defineConfig } from "drizzle-kit";
import { Resource } from "sst";

// Run drizzle-kit through `sst shell` (see root package.json db:* scripts) so the DatabaseUrl secret is linked.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./packages/core/db/schema"],
  dbCredentials: {
    url: Resource.DatabaseUrl.value,
  },
});
