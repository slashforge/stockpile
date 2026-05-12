import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import pg from "pg";
import { z } from "zod";

const { Pool } = pg;
const PORT = Number(process.env.PORT ?? 4444);
const WRITE_ACCESS_ENABLED = process.env.DEV_MCP_ALLOW_WRITES !== "false";
const API_BASE_URL = process.env.DEV_MCP_API_URL ?? process.env.BACKEND_URL ?? "http://localhost:4040";

const FIXTURES = {
  basic_user_flow: {
    userId: "usr_dev_seed",
    authUserId: "auth_dev_seed",
    email: "dev.seed@stackforge.local",
    wallet: "DevSeedWallet1111111111111111111111111111111",
    username: "dev_seed",
  },
} as const;

function buildDatabaseUrlFromParts() {
  const host = process.env.DATABASE_HOST;
  const username = process.env.DATABASE_USERNAME;
  const password = process.env.DATABASE_PASSWORD;
  const port = process.env.DATABASE_PORT ?? "5432";
  const database = process.env.DATABASE_NAME ?? "postgres";

  if (!host || !username || !password) {
    return null;
  }

  const user = encodeURIComponent(username);
  const pass = encodeURIComponent(password);
  return `postgresql://${user}:${pass}@${host}:${port}/${database}?sslmode=require`;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL || buildDatabaseUrlFromParts();

  if (!databaseUrl) {
    throw new Error(
      "Database connection not configured. Set DATABASE_URL or DATABASE_HOST/DATABASE_USERNAME/DATABASE_PASSWORD.",
    );
  }

  return databaseUrl;
}

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: Number(process.env.DEV_MCP_DB_POOL_SIZE ?? 3),
  ssl: process.env.DEV_MCP_DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

function json(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") {
      return item.toString();
    }

    return item;
  });
}

function stripLeadingSqlComments(sql: string) {
  let remaining = sql.trim();

  while (remaining.startsWith("--") || remaining.startsWith("/*")) {
    if (remaining.startsWith("--")) {
      const nextLine = remaining.indexOf("\n");
      remaining = nextLine === -1 ? "" : remaining.slice(nextLine + 1).trimStart();
      continue;
    }

    const commentEnd = remaining.indexOf("*/");
    remaining = commentEnd === -1 ? "" : remaining.slice(commentEnd + 2).trimStart();
  }

  return remaining;
}

function isReadOnlyStatement(sql: string) {
  const firstWord = stripLeadingSqlComments(sql).match(/^[a-zA-Z]+/)?.[0]?.toLowerCase();
  return firstWord ? ["select", "with", "explain", "show"].includes(firstWord) : false;
}

function assertIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${label} must be a valid Postgres identifier`);
  }
}

async function runQuery(sql: string, params: unknown[] = [], options?: { timeoutMs?: number }) {
  const client = await pool.connect();
  const timeoutMs = Math.min(Math.max(options?.timeoutMs ?? 15_000, 1_000), 60_000);

  try {
    await client.query("BEGIN READ ONLY");
    await client.query("select set_config('statement_timeout', $1, true)", [`${timeoutMs}`]);
    const result = await client.query(sql, params);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function runWritableQuery(sql: string, params: unknown[] = [], timeoutMs = 15_000) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const boundedTimeoutMs = Math.min(Math.max(timeoutMs, 1_000), 60_000);
    await client.query("select set_config('statement_timeout', $1, true)", [`${boundedTimeoutMs}`]);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function applyBasicUserFixture() {
  const fixture = FIXTURES.basic_user_flow;

  await runWritableQuery(
    `insert into "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
     values ($1, $2, $3, true, null, now(), now())
     on conflict (id) do update set
       name = excluded.name,
       email = excluded.email,
       "emailVerified" = excluded."emailVerified",
       image = excluded.image,
       "updatedAt" = now()`,
    [fixture.authUserId, "Dev Seed User", fixture.email],
  );

  await runWritableQuery(
    `insert into users (id, email, wallet, username, display_name, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (id) do update set
       email = excluded.email,
       wallet = excluded.wallet,
       username = excluded.username,
       display_name = excluded.display_name,
       updated_at = now()`,
    [fixture.userId, fixture.email, fixture.wallet, fixture.username, "Dev Seed User"],
  );

  return fixture;
}

async function resetBasicUserFixture() {
  const fixture = FIXTURES.basic_user_flow;
  await runWritableQuery("delete from users where id = $1", [fixture.userId]);
  await runWritableQuery("delete from \"user\" where id = $1", [fixture.authUserId]);
  return fixture;
}

function createDevMcpServer() {
  const server = new McpServer({
    name: "stackforge-dev-mcp",
    version: "1.0.0",
  });
  const tool = server.tool.bind(server) as (
    name: string,
    description: string,
    paramsSchema: Record<string, z.ZodTypeAny>,
    cb: (args: any) => Promise<unknown>,
  ) => void;

  tool(
    "dev_db_list_tables",
    "List database tables and views available to the local dev MCP",
    {
      schemaName: z.string().optional().describe("Schema to inspect. Defaults to public."),
    },
    async ({ schemaName }) => {
      const schema = schemaName ?? "public";

      try {
        const result = await runQuery(
          `select table_schema, table_name, table_type
           from information_schema.tables
           where table_schema = $1
           order by table_name`,
          [schema],
        );

        return { content: [{ type: "text", text: json({ schema, tables: result.rows }) }] };
      } catch (error) {
        return { content: [{ type: "text", text: json({ error: error instanceof Error ? error.message : "Failed to list tables" }) }] };
      }
    },
  );

  tool(
    "dev_db_describe_table",
    "Describe columns, types, nullability, and defaults for a database table",
    {
      tableName: z.string().describe("Table name to describe"),
      schemaName: z.string().optional().describe("Schema name. Defaults to public."),
    },
    async ({ tableName, schemaName }) => {
      const schema = schemaName ?? "public";

      try {
        assertIdentifier(schema, "schemaName");
        assertIdentifier(tableName, "tableName");

        const result = await runQuery(
          `select column_name, data_type, is_nullable, column_default, ordinal_position
           from information_schema.columns
           where table_schema = $1 and table_name = $2
           order by ordinal_position`,
          [schema, tableName],
        );

        return { content: [{ type: "text", text: json({ schema, table: tableName, columns: result.rows }) }] };
      } catch (error) {
        return { content: [{ type: "text", text: json({ error: error instanceof Error ? error.message : "Failed to describe table" }) }] };
      }
    },
  );

  tool(
    "dev_db_query",
    "Run a SQL query against the dev database. Writes are enabled by default for local dev; set DEV_MCP_ALLOW_WRITES=false to block mutations.",
    {
      sql: z.string().min(1).describe("SQL to execute. Use $1, $2, ... placeholders for params."),
      params: z.array(z.unknown()).optional().describe("Optional positional query parameters."),
      maxRows: z.number().int().min(1).max(500).optional().describe("Maximum rows to return. Defaults to 100."),
      timeoutMs: z.number().int().min(1000).max(60000).optional().describe("Statement timeout in milliseconds. Defaults to 15000."),
    },
    async ({ sql, params, maxRows, timeoutMs }) => {
      const readOnly = isReadOnlyStatement(sql);

      if (!readOnly && !WRITE_ACCESS_ENABLED) {
        return {
          content: [{
            type: "text",
            text: json({
              error: "Write statements are disabled because DEV_MCP_ALLOW_WRITES=false.",
            }),
          }],
        };
      }

      try {
        const result = readOnly
          ? await runQuery(sql, params ?? [], { timeoutMs })
          : await runWritableQuery(sql, params ?? [], timeoutMs);
        const limit = maxRows ?? 100;

        return {
          content: [{
            type: "text",
            text: json({
              command: result.command,
              rowCount: result.rowCount,
              fields: result.fields.map((field) => field.name),
              rows: result.rows.slice(0, limit),
              truncated: result.rows.length > limit,
              writeAccessEnabled: WRITE_ACCESS_ENABLED,
            }),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: json({ error: error instanceof Error ? error.message : "Database query failed" }) }] };
      }
    },
  );

  tool(
    "dev_api_request",
    "Call the local API from the dev MCP. Defaults to DEV_MCP_API_URL/BACKEND_URL or http://localhost:4040.",
    {
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
      path: z.string().min(1).describe("API path like /health. Absolute URLs are not allowed."),
      headers: z.record(z.string()).optional().describe("Optional request headers"),
      body: z.unknown().optional().describe("Optional JSON request body"),
      timeoutMs: z.number().int().min(1000).max(60000).optional().describe("Request timeout in milliseconds. Defaults to 15000."),
    },
    async ({ method, path, headers, body, timeoutMs }) => {
      try {
        if (/^https?:\/\//i.test(path)) {
          throw new Error("Use path only; absolute URLs are not allowed for dev_api_request");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 15_000);
        const response = await fetch(new URL(path, API_BASE_URL), {
          method,
          headers: {
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...(headers ?? {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await response.text();
        const contentType = response.headers.get("content-type") ?? "";
        const responseBody = contentType.includes("application/json") && text
          ? JSON.parse(text)
          : text;

        return {
          content: [{
            type: "text",
            text: json({
              baseUrl: API_BASE_URL,
              path,
              status: response.status,
              ok: response.ok,
              headers: Object.fromEntries(response.headers.entries()),
              body: responseBody,
            }),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: json({ error: error instanceof Error ? error.message : "API request failed" }) }] };
      }
    },
  );

  tool(
    "dev_seed_fixture",
    "List, apply, or reset curated local development seed fixtures.",
    {
      action: z.enum(["list", "apply", "reset"]).describe("Fixture action"),
      fixture: z.enum(["basic_user_flow"]).optional().describe("Fixture name. Required for apply/reset."),
    },
    async ({ action, fixture }) => {
      try {
        if (action === "list") {
          return {
            content: [{
              type: "text",
              text: json({
                fixtures: [{
                  name: "basic_user_flow",
                  description: "Creates one dev auth user and app user for local testing.",
                  ids: FIXTURES.basic_user_flow,
                }],
              }),
            }],
          };
        }

        if (fixture !== "basic_user_flow") {
          throw new Error("fixture is required and must be basic_user_flow");
        }

        if (action === "reset") {
          const ids = await resetBasicUserFixture();
          return { content: [{ type: "text", text: json({ action, fixture, ids }) }] };
        }

        const ids = await applyBasicUserFixture();
        return { content: [{ type: "text", text: json({ action, fixture, ids }) }] };
      } catch (error) {
        return { content: [{ type: "text", text: json({ error: error instanceof Error ? error.message : "Seed fixture action failed" }) }] };
      }
    },
  );

  return server;
}

const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({
  status: "ok",
  service: "stackforge-dev-mcp",
  writeAccessEnabled: WRITE_ACCESS_ENABLED,
  apiBaseUrl: API_BASE_URL,
}));

app.all("/mcp", async (c) => {
  const transport = new StreamableHTTPTransport();
  const server = createDevMcpServer();

  await server.connect(transport);
  return transport.handleRequest(c as never);
});

export default {
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 30,
};
