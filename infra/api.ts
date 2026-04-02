import { domains } from "./domains";
import {
  databaseUrl,
  databaseHost,
  databaseUsername,
  databasePassword,
} from "./secrets";

export const api = new sst.cloudflare.Worker("Api", {
    url: true,
    handler: "apps/api/index.ts",
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
    ],
    domain: domains.api,
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

export const apiUrl = api.url

