import { domains } from "./domains";
import { isDeployed } from "./utils";

// Dynamic Open Graph cards for shared web-app links (functions/og). satori + native resvg run on Lambda; the web
// app's router worker (apps/web/worker) proxies them under app.<host>/og/* and caches them at the edge.
// Static cards (landing pages, the web app default) are rendered at build time and never hit this function.
const OG_PORT = 4500;

export const ogFunction = isDeployed()
  ? new sst.aws.Function("OgImages", {
      handler: "functions/og/handler.handler",
      runtime: "nodejs22.x",
      architecture: "x86_64",
      memory: "1024 MB",
      timeout: "20 seconds",
      url: true,
      // Fonts ship with the function; render.ts reads ./fonts/ next to the bundle (no runtime CDN fetch).
      copyFiles: [{ from: "functions/og/fonts", to: "fonts" }],
      nodejs: {
        install: ["@resvg/resvg-js", "@resvg/resvg-js-linux-x64-gnu"],
      },
      environment: {
        API_URL: `https://${domains.api}`,
        APP_HOST: domains.app,
      },
    })
  : undefined;

export const ogDev = !isDeployed()
  ? new sst.x.DevCommand("OgImages", {
      environment: {
        PORT: String(OG_PORT),
        API_URL: "http://localhost:4040",
        APP_HOST: "localhost:5173",
      },
      dev: { command: "bun run og:serve", directory: "functions" },
    })
  : undefined;

export const ogUrl = ogFunction ? ogFunction.url.apply((url) => url.replace(/\/$/, "")) : `http://localhost:${OG_PORT}`;
