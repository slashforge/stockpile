import { domains } from "./domains";
import { ogUrl } from "./og";
import { privyAppId, privyWebClientId } from "./secrets";
import { isDeployed } from "./utils";

// Vite SPA (apps/web) served as static assets from a Cloudflare Worker at app.<host>.
// VITE_* values are inlined at build time; the Privy ids are public identifiers.
// A router worker (apps/web/worker) runs before the assets: it serves link-preview tags for shared /bag and /asset
// links and proxies their OG cards from the OG Lambda (infra/og.ts). OG_ORIGIN / API_ORIGIN are read by that worker.
export const web = new sst.cloudflare.StaticSiteV2("NewsbidWeb", {
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
    OG_ORIGIN: ogUrl,
    API_ORIGIN: isDeployed() ? `https://${domains.api}` : "http://localhost:4040",
  },
  dev: {
    command: "bun run dev",
    directory: "apps/web",
    url: "http://localhost:5173",
  },
  transform: {
    server: (args) => {
      args.handler = "apps/web/worker/index.ts";
      args.assets = $output(args.assets!).apply((assets) => ({ ...assets, runWorkerFirst: true }));
    },
  },
});
