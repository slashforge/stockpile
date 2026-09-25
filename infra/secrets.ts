// Set with `sst secret set <Name> <value> [--stage <stage>]`. Secrets without a placeholder are required:
// SST refuses to run/deploy the stage until they are set. Empty-placeholder secrets are optional and fail soft.

// Postgres connection string. Local stages connect directly; deployed stages put Hyperdrive in front of it (infra/database.ts).
export const databaseUrl = new sst.Secret("DatabaseUrl");

// Privy server credentials for verifying identity tokens (/me, saves, portfolio, trading).
export const privyAppId = new sst.Secret("PrivyAppId");
export const privyAppSecret = new sst.Secret("PrivyAppSecret");
// Public Privy mobile client id, injected into the Expo bundle. Empty: the app runs browse-only.
export const privyClientId = new sst.Secret("PrivyClientId", "");

// Jupiter (quotes, swaps, token metadata, prices) and Helius (balances, activity, simulation).
export const jupiterApiKey = new sst.Secret("JupiterApiKey");
export const heliusApiKey = new sst.Secret("HeliusApiKey");

// Base58 (or solana-keygen JSON) secret of the SOL-funded wallet that pays swap network fees and token-account rent.
// Empty placeholder: /trade/prepare fails closed with PROVIDER_NOT_CONFIGURED until it is set.
export const solanaPaymasterKey = new sst.Secret("SolanaPaymasterKey", "");

// tokens.xyz candles for the chart endpoints. Empty placeholder: charts fail soft (reason "unconfigured").
export const tokensApiKey = new sst.Secret("TokensApiKey", "");
// Pyth Hermes underlying reference prices. Empty: falls back to Jupiter's stock reference price.
export const pythApiKey = new sst.Secret("PythApiKey", "");
// CongressInvests API key. Empty: free tier (100 req/day).
export const congressApiKey = new sst.Secret("CongressApiKey", "");
// Offline story curation only. Never exposed to mobile or public feed reads.
export const openaiApiKey = new sst.Secret("OpenaiApiKey", "");

// Emergency trading kill switch: comma-separated mints or symbols (e.g. "KALSHI,XsbEhL..."). Empty = none blocked.
export const blockedMints = new sst.Secret("BlockedMints", "");

export const apiSecrets = [
  privyAppId,
  privyAppSecret,
  jupiterApiKey,
  heliusApiKey,
  solanaPaymasterKey,
  tokensApiKey,
  pythApiKey,
  congressApiKey,
  openaiApiKey,
  blockedMints,
];
