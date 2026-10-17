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

// Independent from price snapshots: bounded feed ingestion and missing-analysis retries.
export const storyRefresh = isDeployed()
  ? new sst.cloudflare.Cron("StoryRefresh", {
      schedules: ["15,45 * * * *"],
      worker: {
        handler: "apps/api/stories-cron.ts",
        build: WORKER_BUILD,
        link: [...API_LINKS, database!],
        transform: WORKER_TRANSFORM,
      },
    })
  : undefined;

// STOCK Act disclosures for the congress tracker bags (apps/api/congress-cron.ts). CongressInvests refreshes every 6 h;
// 8 requests per run x 4 runs = 32/day, inside the 100/day free tier. Offset to :30 to avoid the other crons.
export const congressIngest = isDeployed()
  ? new sst.cloudflare.Cron("CongressIngest", {
      schedules: ["30 */6 * * *"],
      worker: {
        handler: "apps/api/congress-cron.ts",
        build: WORKER_BUILD,
        link: [...API_LINKS, database!],
        transform: WORKER_TRANSFORM,
      },
    })
  : undefined;

// Jim Cramer calls for the inverse-cramer bag (apps/api/cramer-cron.ts) from CNBC's Mad Money feed. Mad Money articles
// publish around 23:00 UTC on weekdays; every 6 h at :50 keeps clear of the other crons. At most 12 article fetches and
// one OpenAI call per article that links a tradable ticker per run (typically 0-3).
export const cramerIngest = isDeployed()
  ? new sst.cloudflare.Cron("CramerIngest", {
      schedules: ["50 */6 * * *"],
      worker: {
        handler: "apps/api/cramer-cron.ts",
        build: WORKER_BUILD,
        link: [...API_LINKS, database!],
        transform: WORKER_TRANSFORM,
      },
    })
  : undefined;

export const apiUrl = isDeployed()
  ? $interpolate`https://${domains.api}`
  : "http://localhost:4040";
