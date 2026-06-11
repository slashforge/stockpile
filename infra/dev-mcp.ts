import {
  databaseHost,
  databasePassword,
  databaseUrl,
  databaseUsername,
} from "./secrets";
import { isDeployed } from "./utils";

export const devMcp = !isDeployed()
  ? new sst.x.DevCommand("DevMcp", {
      environment: {
        PORT: "4444",
        DEV_MCP_API_URL: process.env.DEV_MCP_API_URL ?? "http://localhost:4040",
        DEV_MCP_ALLOW_WRITES: process.env.DEV_MCP_ALLOW_WRITES ?? "true",
      },
      link: [databaseUrl, databaseHost, databaseUsername, databasePassword],
      dev: { command: "bun dev", directory: "apps/dev-mcp" },
    })
  : undefined;

export const devMcpUrl = !isDeployed()
  ? "http://localhost:4444/mcp"
  : undefined;
