import {
  databaseHost,
  databasePassword,
  databaseUrl,
  databaseUsername,
} from "./secrets";
import { DEPLOYED_STAGES } from "./utils";

export const devMcp = !DEPLOYED_STAGES.includes($app.stage)
  ? new sst.x.DevCommand("DevMcp", {
      environment: {
        DATABASE_URL: databaseUrl.value,
        DATABASE_HOST: databaseHost.value,
        DATABASE_USERNAME: databaseUsername.value,
        DATABASE_PASSWORD: databasePassword.value,
        DATABASE_PORT: "5432",
        DATABASE_NAME: "postgres",
        PORT: "4444",
        DEV_MCP_API_URL: process.env.DEV_MCP_API_URL ?? "http://localhost:4040",
        DEV_MCP_ALLOW_WRITES: process.env.DEV_MCP_ALLOW_WRITES ?? "true",
      },
      link: [databaseUrl, databaseHost, databaseUsername, databasePassword],
      dev: { command: "bun dev", directory: "apps/dev-mcp" },
    })
  : undefined;

export const devMcpUrl = !DEPLOYED_STAGES.includes($app.stage)
  ? "http://localhost:4444/mcp"
  : undefined;
