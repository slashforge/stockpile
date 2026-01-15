/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "riven",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          profile: "slashforge",
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    const { backendUrl } = await import("./infra/backend");

    await import("./infra/orm");

    const { landing } = await import("./infra/landing");

    return {
      backendUrl: backendUrl,
      landingUrl: landing.url,
    };
  },
});
