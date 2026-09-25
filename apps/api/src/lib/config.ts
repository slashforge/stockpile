import { Resource } from "sst";

// All runtime configuration comes from SST links (`sst dev`, `sst shell`, or the deployed Worker bindings).
// Declared in infra/secrets.ts and infra/config.ts. Nothing is read from process.env.

export type SecretName =
  | "PrivyAppId"
  | "PrivyAppSecret"
  | "JupiterApiKey"
  | "HeliusApiKey"
  | "SolanaPaymasterKey"
  | "TokensApiKey"
  | "PythApiKey"
  | "CongressApiKey"
  | "OpenaiApiKey"
  | "BlockedMints";

/** Issuer directories and background providers; all on by default, switched off in tests to avoid network calls. */
export type FeatureName = "xstocks" | "prestocks" | "market" | "brandColors";

type AppConfig = { dev: boolean; apiUrl: string; webUrl: string; corsOrigins: string[] };

const LOCAL_CORS_ORIGINS = ["http://localhost:8081", "http://localhost:19006", "http://localhost:4321"];

const links = Resource as unknown as Record<string, unknown>;
const secretOverrides = new Map<SecretName, string | undefined>();
const featureOverrides = new Map<FeatureName, boolean>();

function linked<T>(name: string): T | undefined {
  // The Resource proxy throws for unlinked names; `in` checks the loaded links without throwing.
  return name in links ? (links[name] as T) : undefined;
}

/** Trimmed secret value, or undefined when unlinked or empty (optional secrets use an empty placeholder). */
export function secret(name: SecretName): string | undefined {
  const value = secretOverrides.has(name) ? secretOverrides.get(name) : linked<{ value?: string }>(name)?.value;
  return value?.trim() || undefined;
}

export function feature(name: FeatureName): boolean {
  return featureOverrides.get(name) ?? true;
}

export function corsOrigins(): string[] {
  return linked<AppConfig>("AppConfig")?.corsOrigins ?? LOCAL_CORS_ORIGINS;
}

/** Test-only: override secrets (undefined = unset) without SST links. */
export function setSecrets(values: Partial<Record<SecretName, string | undefined>>) {
  for (const [name, value] of Object.entries(values)) secretOverrides.set(name as SecretName, value);
}

/** Test-only: toggle features. */
export function setFeatures(values: Partial<Record<FeatureName, boolean>>) {
  for (const [name, value] of Object.entries(values)) if (value !== undefined) featureOverrides.set(name as FeatureName, value);
}

/** Test-only: drop all overrides. */
export function resetConfig() {
  secretOverrides.clear();
  featureOverrides.clear();
}
