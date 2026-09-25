export type PublicEnv = Record<string, string | undefined>;

const trimmed = (value: string | undefined) => (value ?? "").trim();

export function readConfig(env: PublicEnv) {
  const privyAppId = trimmed(env.EXPO_PUBLIC_PRIVY_APP_ID);
  const privyClientId = trimmed(env.EXPO_PUBLIC_PRIVY_CLIENT_ID);
  return {
    apiUrl: (trimmed(env.EXPO_PUBLIC_API_URL) || "http://localhost:4040").replace(/\/+$/, ""),
    privyAppId,
    privyClientId,
    /** Sign-in and wallet features are only mounted when both Privy IDs are present. */
    privyConfigured: privyAppId.length > 0 && privyClientId.length > 0,
    solanaRpcUrl: trimmed(env.EXPO_PUBLIC_SOLANA_RPC_URL) || "https://api.mainnet-beta.solana.com",
  };
}

// Expo inlines EXPO_PUBLIC_* only for static `process.env.NAME` member access.
const config = readConfig({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_PRIVY_APP_ID: process.env.EXPO_PUBLIC_PRIVY_APP_ID,
  EXPO_PUBLIC_PRIVY_CLIENT_ID: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID,
  EXPO_PUBLIC_SOLANA_RPC_URL: process.env.EXPO_PUBLIC_SOLANA_RPC_URL,
});

export const API_URL = config.apiUrl;
export const PRIVY_APP_ID = config.privyAppId;
export const PRIVY_CLIENT_ID = config.privyClientId;
export const PRIVY_CONFIGURED = config.privyConfigured;
export const SOLANA_RPC_URL = config.solanaRpcUrl;
