import { appConfig } from "./config";
import { database } from "./database";
import { domains } from "./domains";
import { apiSecrets, databaseUrl } from "./secrets";
import { isDeployed } from "./utils";

// The API reads everything through `Resource.*` (apps/api/src/lib/config.ts); nothing is passed as env vars.
const API_LINKS = [appConfig, ...apiSecrets];

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

const WORKER_BUILD = {
  esbuild: {
    define: {
      "process.version": '"v20.0.0"',
      "process.versions.node": '"20.0.0"',
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
      build: WORKER_BUILD,
      link: [...API_LINKS, database!],
      domain: domains.api,
      placement: {
        mode: "smart",
      },
      transform: WORKER_TRANSFORM,
    });

// Hourly price snapshots (apps/api/cron.ts). Locally the Bun dev server (apps/api/dev.ts) runs this on an interval.
export const priceSnapshots = isDeployed()
  ? new sst.cloudflare.Cron("PriceSnapshots", {
      schedules: ["0 * * * *"],
      worker: {
        handler: "apps/api/cron.ts",
        build: WORKER_BUILD,
        link: [...API_LINKS, database!],
        transform: WORKER_TRANSFORM,
      },
    })
  : undefined;

export const apiUrl = isDeployed()
  ? $interpolate`https://${domains.api}`
  : "http://localhost:4040";
