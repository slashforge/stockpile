import { appConfig } from "./config";
import { isDeployed } from "./utils";

export const expo = !isDeployed()
  ? new sst.x.DevCommand("Expo", {
      environment: {
        EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4040",
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
