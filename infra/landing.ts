import { domains } from "./domains";
import { DEPLOYED_STAGES } from "./utils";


export const landing = new sst.aws.Astro("__NAME_PASCAL__Landing", {
  path: "apps/landing",
  domain: {
    name: domains.landing,
    dns: sst.cloudflare.dns()
  },
  environment: {
    PUBLIC_API_URL: DEPLOYED_STAGES.includes($app.stage) ? `https://${domains.api}` : "http://localhost:4040"
  },
  dev: {
    command: "bun run dev",
    directory: "apps/landing"
  }
})
