/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "stockpile",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "cloudflare",
    };
  },
  async run() {
    await import("./infra/database");

    const { apiUrl } = await import("./infra/api");

    await import("./infra/orm");

    const { devMcpUrl } = await import("./infra/dev-mcp");

    const { landing } = await import("./infra/landing");

    await import("./infra/expo");

    return {
      apiUrl: apiUrl,
      devMcpUrl,
      landingUrl: landing.url,
    };
  },
});
