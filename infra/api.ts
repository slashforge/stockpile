import { domains } from "./domains";
import {
  betterAuthSecret,
  resendApiKey,
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
      BETTER_AUTH_SECRET: betterAuthSecret.value,
      BETTER_AUTH_URL: `https://${domains.api}`,
      RESEND_API_KEY: resendApiKey.value,
    },
    link: [
      betterAuthSecret,
      resendApiKey,
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

