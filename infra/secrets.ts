export const betterAuthSecret = new sst.Secret("BetterAuthSecret");
export const resendApiKey = new sst.Secret("ResendApiKey");
export const databaseUrl = new sst.Secret("DatabaseUrl");
// tokens.xyz candles for the chart endpoints. Empty placeholder: charts fail soft (reason "unconfigured") until it is set.
export const tokensApiKey = new sst.Secret("TokensApiKey", "");
// Base58 (or solana-keygen JSON) secret of the SOL-funded wallet that pays swap network fees and token-account rent.
// Empty placeholder: /trade/prepare fails closed with PROVIDER_NOT_CONFIGURED until it is set.
export const solanaPaymasterKey = new sst.Secret("SolanaPaymasterKey", "");

export const databaseHost = new sst.Secret("DatabaseHost");
export const databaseUsername = new sst.Secret("DatabaseUsername");
export const databasePassword = new sst.Secret("DatabasePassword");
