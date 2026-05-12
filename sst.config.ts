/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "stackforge",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "cloudflare",
    };
  },
  async run() {
    await import("./infra/database");

    const { apiUrl } = await import("./infra/api");

    await import("./infra/orm");

    const { landing } = await import("./infra/landing");

    return {
      apiUrl: apiUrl,
      landingUrl: landing.url,
    };
  },
});
