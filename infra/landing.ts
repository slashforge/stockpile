import { domains } from "./domains";
import { isDeployed } from "./utils";

export const landing = new sst.cloudflare.Astro("StockpileLanding", {
  path: "apps/landing",
  domain: domains.landing,
  environment: {
    PUBLIC_API_URL: isDeployed() ? `https://${domains.api}` : "http://localhost:4040",
    PUBLIC_APP_URL: isDeployed() ? `https://${domains.app}` : "http://localhost:5173",
  },
  dev: {
    command: "bun run dev",
    directory: "apps/landing"
  }
})
