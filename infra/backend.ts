import { domains } from "./domains";
import {
  databaseUrl,
  databaseHost,
  databaseUsername,
  databasePassword,
  heliusRpcUrl,
  jupiterApiKey,
  privyAppId,
  privyAppSecret,
} from "./secrets";
import { DEPLOYED_STAGES } from "./utils";

export const backend = !DEPLOYED_STAGES.includes($app.stage)
  ? new sst.x.DevCommand("Backend", {
    environment: {
      DATABASE_URL: databaseUrl.value,
      DATABASE_HOST: databaseHost.value,
      DATABASE_USERNAME: databaseUsername.value,
      DATABASE_PASSWORD: databasePassword.value,
      DATABASE_PORT: "5432",
      DATABASE_NAME: "postgres",
    },
    link: [
      databaseUrl,
      databaseHost,
      databaseUsername,
      databasePassword,
      heliusRpcUrl,
      jupiterApiKey,
      privyAppId,
      privyAppSecret,
    ],
    dev: { command: "bun dev", directory: "apps/backend" },
  })
  : new sst.cloudflare.Worker("Backend", {
    url: true,
    handler: "apps/backend/index.ts",
    environment: {
      DATABASE_URL: databaseUrl.value,
      DATABASE_HOST: databaseHost.value,
      DATABASE_USERNAME: databaseUsername.value,
      DATABASE_PASSWORD: databasePassword.value,
      DATABASE_PORT: "5432",
      DATABASE_NAME: "postgres",
    },
    link: [
      databaseUrl,
      databaseHost,
      databaseUsername,
      databasePassword,
      heliusRpcUrl,
      jupiterApiKey,
      privyAppId,
      privyAppSecret,
    ],
    domain: domains.backend,
    transform: {
      worker: {
        observability: {
          enabled: true,
          logs: {
            enabled: true,
            invocationLogs: true,
          },
        },
      },
    },
  });

export const backendUrl = DEPLOYED_STAGES.includes($app.stage)
  ? (backend as sst.cloudflare.Worker).url
  : "http://localhost:4040";
