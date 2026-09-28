import { domains } from "./domains";
import { privyAppId, privyWebClientId } from "./secrets";
import { isDeployed } from "./utils";

// Vite SPA (apps/web) served as static assets from a Cloudflare Worker at app.<host>.
// VITE_* values are inlined at build time; the Privy ids are public identifiers.
export const web = new sst.cloudflare.StaticSiteV2("StockpileWeb", {
  path: "apps/web",
  build: {
    command: "bun run build",
    output: "dist",
  },
  notFound: "single-page-application",
  domain: domains.app,
  environment: {
    VITE_API_URL: isDeployed() ? `https://${domains.api}` : "http://localhost:4040",
    VITE_PRIVY_APP_ID: privyAppId.value,
    VITE_PRIVY_CLIENT_ID: privyWebClientId.value,
  },
  dev: {
    command: "bun run dev",
    directory: "apps/web",
    url: "http://localhost:5173",
  },
});
