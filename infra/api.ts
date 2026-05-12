import { domains } from "./domains";
import { database } from "./database";
import { betterAuthSecret, databaseUrl, resendApiKey } from "./secrets";

const DEPLOYED_STAGES = ["prod", "dev"];

const API_ENV = {
  BETTER_AUTH_SECRET: betterAuthSecret.value,
  BETTER_AUTH_URL: `https://${domains.api}`,
  RESEND_API_KEY: resendApiKey.value,
};

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

export const api = !DEPLOYED_STAGES.includes($app.stage)
  ? new sst.x.DevCommand("Api", {
      environment: {
        ...API_ENV,
        DATABASE_URL: databaseUrl.value,
        BETTER_AUTH_URL: "http://localhost:4040",
      },
      link: [databaseUrl, betterAuthSecret, resendApiKey],
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
      environment: API_ENV,
      link: [database, betterAuthSecret, resendApiKey],
      domain: domains.api,
      placement: {
        mode: "smart",
      },
      transform: WORKER_TRANSFORM,
    });

export const apiUrl = DEPLOYED_STAGES.includes($app.stage)
  ? $interpolate`${(api as sst.cloudflare.Worker).url}`
  : "http://localhost:4040";
