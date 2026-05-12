import { domains } from "./domains";
import { DEPLOYED_STAGES } from "./utils";


export const landing = new sst.cloudflare.Astro("StackForgeLanding", {
  path: "apps/landing",
  domain: domains.landing,
  environment: {
    PUBLIC_API_URL: DEPLOYED_STAGES.includes($app.stage) ? `https://${domains.api}` : "http://localhost:4040"
  },
  dev: {
    command: "bun run dev",
    directory: "apps/landing"
  }
})
