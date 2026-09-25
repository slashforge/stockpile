import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { Resource } from "sst";
import * as schema from "./schema/index";

// Deployed Workers get the Hyperdrive binding (`Database`); local stages get the `DatabaseUrl` secret.
// Both arrive as SST links (`sst dev` / `sst shell`); the Resource proxy throws for unlinked names, so check with `in`.
function connectionString() {
  const links = Resource as unknown as Record<string, { connectionString?: string; value?: string } | undefined>;
  if ("Database" in links && links.Database?.connectionString) return links.Database.connectionString;
  if ("DatabaseUrl" in links && links.DatabaseUrl?.value) return links.DatabaseUrl.value;
  throw new Error("Database is not linked; run through `sst dev` or `sst shell` with the DatabaseUrl secret set");
}

function createDb() {
  const url = connectionString();
  const client = {
    async query(query: unknown, params?: unknown[]) {
      const pg = new Client({ connectionString: url });
      await pg.connect();
      try { return await pg.query(query as never, params as never); }
      finally { await pg.end().catch(() => undefined); }
    },
  };
  return drizzle({ client: client as never, schema });
}

let instance: ReturnType<typeof createDb> | undefined;
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    instance ??= createDb();
    return Reflect.get(instance, prop, receiver);
  },
});
export * from "./types";
