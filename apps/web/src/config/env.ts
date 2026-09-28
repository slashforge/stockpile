const trimmed = (value: string | undefined) => (value ?? "").trim();

// Vite inlines VITE_* at build time; SST injects them from infra/web.ts (Privy ids come from secrets).
const privyAppId = trimmed(import.meta.env.VITE_PRIVY_APP_ID);

export const API_URL = (trimmed(import.meta.env.VITE_API_URL) || "http://localhost:4040").replace(/\/+$/, "");
export const PRIVY_APP_ID = privyAppId;
/** Optional web app client id from the Privy dashboard (App clients). */
export const PRIVY_CLIENT_ID = trimmed(import.meta.env.VITE_PRIVY_CLIENT_ID);
/** Sign-in and wallet features are only mounted when a Privy app id is present. */
export const PRIVY_CONFIGURED = privyAppId.length > 0;
export const SOLANA_RPC_URL = trimmed(import.meta.env.VITE_SOLANA_RPC_URL) || "https://api.mainnet-beta.solana.com";
export const APP_VERSION = "web";
