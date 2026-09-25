import { databaseUrl } from "./secrets";
import { isDeployed } from "./utils";

// Hyperdrive requires a publicly resolvable database host, so it is only
// provisioned for deployed stages, with its origin parsed from the DatabaseUrl
// secret. Local stages connect to Postgres directly via DatabaseUrl.
function hyperdrive() {
  const origin = databaseUrl.value.apply((value) => new URL(value));
  return new sst.cloudflare.Hyperdrive("Database", {
    origin: {
      scheme: "postgres",
      host: origin.apply((url) => url.hostname),
      port: origin.apply((url) => Number(url.port || 5432)),
      database: origin.apply((url) => decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres"),
      user: origin.apply((url) => decodeURIComponent(url.username)),
      password: origin.apply((url) => decodeURIComponent(url.password)),
    },
  });
}

export const database = isDeployed() ? hyperdrive() : undefined;
