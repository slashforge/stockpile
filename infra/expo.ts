import { appConfig } from "./config";
import { privyAppId, privyClientId } from "./secrets";
import { isDeployed } from "./utils";

// Expo inlines EXPO_PUBLIC_* at bundle time, so the public Privy ids are injected from SST secrets here.
// EXPO_PUBLIC_API_URL can still be overridden from the shell (e.g. a LAN IP for a physical device).
export const expo = !isDeployed()
  ? new sst.x.DevCommand("Expo", {
      environment: {
        EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4040",
        EXPO_PUBLIC_PRIVY_APP_ID: privyAppId.value,
        EXPO_PUBLIC_PRIVY_CLIENT_ID: privyClientId.value,
        ...(process.env.EAS_PROJECT_ID
          ? { EAS_PROJECT_ID: process.env.EAS_PROJECT_ID }
          : {}),
      },
      link: [appConfig],
      dev: {
        command: "bun dev",
        directory: "apps/mobile",
        autostart: false,
      },
    })
  : undefined;
