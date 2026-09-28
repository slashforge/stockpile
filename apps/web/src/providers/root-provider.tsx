import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, lazy, type ReactNode, Suspense, useContext } from "react";
import { PRIVY_CONFIGURED } from "@/config/env";
import { AuthContext, browseOnlyAuth, type StockpileAuth } from "./auth-context";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, gcTime: 1000 * 60 * 30, refetchOnReconnect: true, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

/** True once Privy's provider is mounted, so Privy hooks (e.g. the login form) are safe to render. */
const PrivyMountedContext = createContext(false);

export function usePrivyMounted() {
  return useContext(PrivyMountedContext);
}

// Privy (and its wallet stack) is code-split and only loads when this build has an app id.
const PrivyAuthProvider = PRIVY_CONFIGURED
  ? lazy(() => import("@/lib/privy/privy-auth-provider").then((mod) => ({ default: mod.PrivyAuthProvider })))
  : null;

/** While Privy loads, the app renders as "restoring session" instead of blocking on the chunk. */
const loadingAuth: StockpileAuth = { ...browseOnlyAuth, configured: true, ready: false };

function AuthProvider({ children }: { children: ReactNode }) {
  if (!PrivyAuthProvider) return <>{children}</>;
  return (
    <Suspense fallback={<AuthContext.Provider value={loadingAuth}>{children}</AuthContext.Provider>}>
      <PrivyAuthProvider>
        <PrivyMountedContext.Provider value>{children}</PrivyMountedContext.Provider>
      </PrivyAuthProvider>
    </Suspense>
  );
}

/** App-wide data + auth. Sheets live in the root route so they can navigate. */
export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
