import { Resource } from "sst";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./packages/core/db/schema"],
  dbCredentials: {
    url: Resource.DatabaseUrl.value!,
  },
});
