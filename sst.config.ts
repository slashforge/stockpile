/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "newsbid",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "cloudflare",
      // AWS only hosts the OG image Lambda (infra/og.ts); everything else is Cloudflare.
      providers: {
        aws: {
          profile: "slashforge",
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    await import("./infra/database");

    const { apiUrl } = await import("./infra/api");

    await import("./infra/orm");

    const { devMcpUrl } = await import("./infra/dev-mcp");

    const { ogUrl } = await import("./infra/og");

    const { landing } = await import("./infra/landing");

    const { web } = await import("./infra/web");

    await import("./infra/expo");

    return {
      apiUrl: apiUrl,
      devMcpUrl,
      ogUrl,
      landingUrl: landing.url,
      webUrl: web.url,
    };
  },
});
