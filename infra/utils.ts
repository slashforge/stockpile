// Stages that deploy real Cloudflare resources (Hyperdrive, Workers, etc.).
// Any other stage is treated as local development and uses direct Postgres
// connections + DevCommands instead.
export const DEPLOYED_STAGES = ["prod", "dev", "beta"];

export const isDeployed = () => DEPLOYED_STAGES.includes($app.stage);
