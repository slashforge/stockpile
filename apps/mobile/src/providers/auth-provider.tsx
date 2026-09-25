import React from "react";
import { PRIVY_CONFIGURED } from "@/config/env";
import { AuthContext, browseOnlyAuth } from "./auth-context";

type PrivyModule = typeof import("@/lib/privy/privy-auth-provider");

// Lazily required so browse-only builds never evaluate the Privy SDK.
const PrivyAuthProvider: PrivyModule["PrivyAuthProvider"] | null = PRIVY_CONFIGURED
  ? (require("@/lib/privy/privy-auth-provider") as PrivyModule).PrivyAuthProvider
  : null;

/** Mounts Privy only when both public IDs are configured; otherwise the app is browse-only. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!PrivyAuthProvider) {
    return <AuthContext.Provider value={browseOnlyAuth}>{children}</AuthContext.Provider>;
  }
  return <PrivyAuthProvider>{children}</PrivyAuthProvider>;
}
