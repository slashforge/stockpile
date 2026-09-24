import { domains } from "./domains";
import { isDeployed } from "./utils";

const AUTH_FROM_EMAIL = "onboarding@resend.dev";
const APP_SCHEME = "stockpile";

export const appConfig = new sst.Linkable("AppConfig", {
  properties: isDeployed()
    ? {
        dev: false,
        apiUrl: `https://${domains.api}`,
        webUrl: `https://${domains.landing}`,
        authFromEmail: AUTH_FROM_EMAIL,
        appScheme: APP_SCHEME,
      }
    : {
        dev: true,
        apiUrl: "http://localhost:4040",
        webUrl: "http://localhost:4321",
        authFromEmail: AUTH_FROM_EMAIL,
        appScheme: APP_SCHEME,
      },
});
