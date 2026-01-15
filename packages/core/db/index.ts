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

const DATABASE_URL = process.env.DATABASE_URL || buildDatabaseUrlFromParts();

if (!DATABASE_URL) {
  throw new Error(
    "Database connection not configured. Set DATABASE_URL or DATABASE_HOST/DATABASE_USERNAME/DATABASE_PASSWORD.",
  );
}

const sql = neon(DATABASE_URL!);


export const db = drizzle({ client: sql });


// Export types
export * from "./types";
