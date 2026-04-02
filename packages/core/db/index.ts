import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index";

import { neon, neonConfig } from "@neondatabase/serverless";

// This MUST be set for PlanetScale Postgres connections
neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;

function buildDatabaseUrlFromParts() {
  const host = process.env.DATABASE_HOST;
  const username = process.env.DATABASE_USERNAME;
  const password = process.env.DATABASE_PASSWORD;

  if (!host || !username || !password) return undefined;

  const port = process.env.DATABASE_PORT ?? "5432";
  const dbName = process.env.DATABASE_NAME ?? "postgres";

  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`;
}

const DUMMY_DATABASE_URL = "postgresql://dummy:dummy@127.0.0.1:5432/postgres";

const DATABASE_URL = process.env.DATABASE_URL || buildDatabaseUrlFromParts() || DUMMY_DATABASE_URL;

if (DATABASE_URL === DUMMY_DATABASE_URL) {
  console.warn(
    "Database connection not configured. Using a dummy DATABASE_URL so the worker can start.",
  );
}

const sql = neon(DATABASE_URL);


export const db = drizzle({ client: sql });


// Export types
export * from "./types";
