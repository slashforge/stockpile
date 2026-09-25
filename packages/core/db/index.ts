import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema/index";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required; set it in the root .env for local development");
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
