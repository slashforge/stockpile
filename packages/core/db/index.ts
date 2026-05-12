import { Resource } from "sst";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema/index";

function hyperdriveConnectionString() {
  try {
    const resources = Resource as unknown as Record<string, { connectionString?: string }>;
    return resources.Database?.connectionString;
  } catch {
    return undefined;
  }
}

function createDb() {
  const DATABASE_URL = hyperdriveConnectionString() ?? process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL or linked Hyperdrive resource is required");
  }

  const client = {
    async query(query: unknown, params?: unknown[]) {
      const pg = new Client({ connectionString: DATABASE_URL });
      await pg.connect();
      try {
        return await pg.query(query as never, params as never);
      } finally {
        await pg.end().catch(() => undefined);
      }
    },
  };

  return drizzle({ client: client as never, schema });
}

type Database = ReturnType<typeof createDb>;

let database: Database | undefined;

function getDb() {
  database ??= createDb();
  return database;
}

export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

// Export types
export * from "./types";
