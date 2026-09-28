import { secret } from "./config";
import { verifyIdentityToken } from "@privy-io/node";
import { db } from "@stockpile/core/db";
import { users } from "@stockpile/core/db/schema";

export type Identity = { id: string; email: string | null; walletAddress: string | null };

// The identity token is a Privy-signed JWT that already carries the user's linked accounts, so it is verified locally against
// the app's JWKS. The Privy SDK's remote JWKS shares one in-flight fetch across requests, which a Worker isolate rejects when
// concurrent requests (e.g. parallel swap legs) await another request's I/O. Only resolved keys are cached here; every fetch
// belongs to the request that started it.
const JWKS_TTL_MS = 60 * 60 * 1000;
let jwksCache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;

async function loadJwks(appId: string): Promise<Map<string, CryptoKey>> {
  const response = await fetch(`https://api.privy.io/v1/apps/${encodeURIComponent(appId)}/jwks.json`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Privy JWKS ${response.status}`);
  const { keys = [] } = await response.json() as { keys?: { kid?: string; kty?: string; crv?: string; x?: string; y?: string }[] };
  const imported = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (!jwk.kid || jwk.kty !== "EC" || jwk.crv !== "P-256") continue;
    imported.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk as never, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]));
  }
  jwksCache = { keys: imported, fetchedAt: Date.now() };
  return imported;
}

async function keyFor(appId: string, kid: string | undefined): Promise<CryptoKey> {
  const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  let keys = fresh ? jwksCache!.keys : await loadJwks(appId);
  // Unknown kid: Privy may have rotated keys since the cache was filled.
  if (kid && !keys.has(kid) && fresh) keys = await loadJwks(appId);
  const key = kid ? keys.get(kid) : keys.values().next().value;
  if (!key) throw new Error("No matching Privy verification key");
  return key;
}

/** `null` when the token is invalid or expired; throws when the verification keys can't be fetched. */
export async function verifyIdentity(token: string): Promise<Identity | null> {
  const appId = secret("PrivyAppId");
  if (!appId || !secret("PrivyAppSecret")) throw new Error("Privy is not configured");
  let kid: string | undefined;
  try {
    kid = (JSON.parse(atob(token.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/"))) as { kid?: string }).kid;
  } catch {
    return null;
  }
  const key = await keyFor(appId, kid);
  try {
    const user = await verifyIdentityToken({ identity_token: token, app_id: appId, verification_key: key });
    const accounts = user.linked_accounts ?? [];
    const email = accounts.find((account) => account.type === "email") as { address?: string } | undefined;
    const wallet = accounts.find((account) => account.type === "wallet" && "chain_type" in account && account.chain_type === "solana") as { address?: string } | undefined;
    return { id: user.id, email: email?.address ?? null, walletAddress: wallet?.address ?? null };
  } catch {
    return null;
  }
}

export async function syncUser(identity: Identity) {
  const [user] = await db.insert(users).values({ id: identity.id, email: identity.email, wallet: identity.walletAddress })
    .onConflictDoUpdate({ target: users.id, set: { email: identity.email, wallet: identity.walletAddress, updatedAt: new Date() } }).returning();
  return { id: user!.id, email: user!.email, walletAddress: user!.wallet, createdAt: user!.createdAt.toISOString() };
}
