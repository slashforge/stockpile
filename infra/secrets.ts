export const betterAuthSecret = new sst.Secret("BetterAuthSecret");
export const resendApiKey = new sst.Secret("ResendApiKey");
export const databaseUrl = new sst.Secret("DatabaseUrl");
// tokens.xyz candles for the chart endpoints. Empty placeholder: charts fail soft (reason "unconfigured") until it is set.
export const tokensApiKey = new sst.Secret("TokensApiKey", "");

export const databaseHost = new sst.Secret("DatabaseHost");
export const databaseUsername = new sst.Secret("DatabaseUsername");
export const databasePassword = new sst.Secret("DatabasePassword");
