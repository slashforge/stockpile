/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { readConfig } from "./env";

describe("readConfig", () => {
  test("defaults to browse-only with local API when nothing is set", () => {
    const config = readConfig({});
    expect(config.privyConfigured).toBe(false);
    expect(config.apiUrl).toBe("http://localhost:4040");
    expect(config.solanaRpcUrl).toBe("https://api.mainnet-beta.solana.com");
  });

  test("requires both Privy IDs (whitespace does not count)", () => {
    expect(readConfig({ EXPO_PUBLIC_PRIVY_APP_ID: "app" }).privyConfigured).toBe(false);
    expect(readConfig({ EXPO_PUBLIC_PRIVY_CLIENT_ID: "client" }).privyConfigured).toBe(false);
    expect(
      readConfig({ EXPO_PUBLIC_PRIVY_APP_ID: "  ", EXPO_PUBLIC_PRIVY_CLIENT_ID: "client" }).privyConfigured,
    ).toBe(false);
    expect(
      readConfig({ EXPO_PUBLIC_PRIVY_APP_ID: " app ", EXPO_PUBLIC_PRIVY_CLIENT_ID: "client" }),
    ).toMatchObject({ privyConfigured: true, privyAppId: "app", privyClientId: "client" });
  });

  test("normalises API URL trailing slashes", () => {
    expect(readConfig({ EXPO_PUBLIC_API_URL: "http://192.168.1.5:4040//" }).apiUrl).toBe(
      "http://192.168.1.5:4040",
    );
  });
});
