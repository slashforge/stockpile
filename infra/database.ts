import { databaseHost, databasePassword, databaseUsername } from "./secrets";
import { isDeployed } from "./utils";

// Hyperdrive requires a publicly resolvable database host, so it is only
// provisioned for deployed stages. Local/dev stages connect to Postgres
// directly via the DatabaseUrl secret (see infra/api.ts).
export const database = isDeployed()
  ? new sst.cloudflare.Hyperdrive("Database", {
      origin: {
        database: "postgres",
        host: databaseHost.value,
        password: databasePassword.value,
        port: 5432,
        scheme: "postgres",
        user: databaseUsername.value,
      },
    })
  : undefined;
