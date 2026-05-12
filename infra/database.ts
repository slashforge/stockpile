import { databaseHost, databasePassword, databaseUsername } from "./secrets";

export const database = new sst.cloudflare.Hyperdrive("Database", {
  origin: {
    database: "postgres",
    host: databaseHost.value,
    password: databasePassword.value,
    port: 5432,
    scheme: "postgres",
    user: databaseUsername.value,
  },
});
