import { Resource } from "sst";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema/index";

type ResourceRecord = Record<string, { value?: string; connectionString?: string }>;

function resource(name: string) {
  try {
    return (Resource as unknown as ResourceRecord)[name];
  } catch {
    return undefined;
  }
}

function isLocalHost(host: string) {
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host);
}

function withDefaultSslMode(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);

    // node-postgres treats sslrootcert as a file path; libpq-style values
    // like `system` break it. Drop it and fall back to sslmode=require.
    if (url.searchParams.has("sslrootcert")) {
      url.searchParams.delete("sslrootcert");
      url.searchParams.set("sslmode", "require");
    }

    if (!url.searchParams.has("sslmode") && !isLocalHost(url.hostname)) {
      url.searchParams.set("sslmode", "require");
    }

    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function databaseUrlFromParts() {
  const host = resource("DatabaseHost")?.value;
  const username = resource("DatabaseUsername")?.value;
  const password = resource("DatabasePassword")?.value;

  if (!host || !username || !password) return undefined;

  const user = encodeURIComponent(username);
  const pass = encodeURIComponent(password);
  const sslmode = isLocalHost(host) ? "disable" : "require";

  return `postgresql://${user}:${pass}@${host}:5432/postgres?sslmode=${sslmode}`;
}

function resolveDatabaseUrl() {
  // Cloudflare Workers: linked Hyperdrive binding.
  const hyperdrive = resource("Database")?.connectionString;
  if (hyperdrive) return hyperdrive;

  // Local dev / `sst shell`: linked DatabaseUrl secret.
  const secret = resource("DatabaseUrl")?.value;
  if (secret) return withDefaultSslMode(secret);

  // Fallback: build from the individual database secrets.
  const parts = databaseUrlFromParts();
  if (parts) return parts;

  throw new Error(
    "Database connection not configured. Link the Database Hyperdrive or DatabaseUrl secret, or run via `sst shell`."
  );
}

function createDb() {
  const DATABASE_URL = resolveDatabaseUrl();

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
