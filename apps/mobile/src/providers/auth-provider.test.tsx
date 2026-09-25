/// <reference types="bun" />
import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

test("without Privy IDs the provider is browse-only and never loads the Privy SDK", async () => {
  // Independent of the local .env (bun auto-loads it) and of test-file ordering.
  const actual = await import("@/config/env");
  mock.module("@/config/env", () => ({
    ...actual,
    PRIVY_APP_ID: "",
    PRIVY_CLIENT_ID: "",
    PRIVY_CONFIGURED: false,
  }));
  const { AuthProvider } = await import("./auth-provider");
  const { useStockpileAuth } = await import("./auth-context");

  function Probe() {
    const auth = useStockpileAuth();
    return (
      <span>
        {[auth.configured, auth.authenticated, auth.signAndSendTransaction !== null].join(",")}
      </span>
    );
  }

  const html = renderToStaticMarkup(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(html).toBe("<span>false,false,false</span>");
  const privyLoaded = Object.keys(require.cache).some((path) => path.includes("@privy-io"));
  expect(privyLoaded).toBe(false);
});
