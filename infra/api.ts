import { appConfig } from "./config";
import { database } from "./database";
import { domains } from "./domains";
import { betterAuthSecret, databaseUrl, resendApiKey } from "./secrets";
import { isDeployed } from "./utils";

const API_LINKS = [appConfig, betterAuthSecret, resendApiKey];

const WORKER_TRANSFORM = {
  worker: {
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
      },
    },
  },
};

export const api = !isDeployed()
  ? new sst.x.DevCommand("Api", {
      link: [...API_LINKS, databaseUrl],
      dev: { command: "bun dev", directory: "apps/api" },
    })
  : new sst.cloudflare.Worker("Api", {
      url: true,
      handler: "apps/api/index.ts",
      build: {
        esbuild: {
          define: {
            "process.version": '"v20.0.0"',
            "process.versions.node": '"20.0.0"',
          },
        },
      },
      link: [...API_LINKS, database!],
      domain: domains.api,
      placement: {
        mode: "smart",
      },
      transform: WORKER_TRANSFORM,
    });

export const apiUrl = isDeployed()
  ? $interpolate`https://${domains.api}`
  : "http://localhost:4040";
