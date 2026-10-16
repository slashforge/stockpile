import { getAccessToken, getIdentityToken, PrivyProvider, useIdentityToken, usePrivy, type User } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { VersionedTransaction } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from "@/config/env";
import { PRIVATE_QUERY_PREFIX } from "@/hooks/query-keys";
import { assertWalletSigned, decodeTransaction } from "@/lib/solana/transaction";
import { definiteRejection, SubmissionError, transactionSignature } from "@/lib/trade/signing";
import { AuthContext, type NewsbidAuth } from "@/providers/auth-context";
import { clearIdentityTokenGetter, setIdentityTokenGetter } from "@/services/api/identity-token";
import { ApiError, submitSignedTransaction } from "@/services/api/newsbid";

/** True when the JWT is missing an `exp` or expires within a minute. */
function tokenExpiring(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return !payload.exp || payload.exp * 1000 - Date.now() < 60_000;
  } catch {
    return true;
  }
}

let refreshing: Promise<string | null> | null = null;

/**
 * Privy re-issues the identity token when the session refreshes (`getAccessToken` with an expired
 * access token). `getIdentityToken()` calls Privy's API on every use, so it's only the last resort,
 * and concurrent requests share one refresh.
 */
function refreshIdentityToken(current: () => string | null): Promise<string | null> {
  refreshing ??= (async () => {
    await getAccessToken().catch(() => null);
    const token = current();
    if (token && !tokenExpiring(token)) return token;
    return getIdentityToken().catch(() => token);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** The Privy-managed (embedded) Solana wallet address, if the user has one yet. */
function embeddedSolanaAddress(user: User | null): string | null {
  for (const account of user?.linkedAccounts ?? []) {
    if (account.type === "wallet" && account.chainType === "solana" && account.walletClientType === "privy") {
      return account.address;
    }
  }
  return null;
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { ready, authenticated: privyAuthenticated, user, logout: privyLogout } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  // Private queries only run once the identity token exists, so no request goes out without the header.
  const authenticated = ready && privyAuthenticated && !!user && !!identityToken;
  // A token fetched when the wallet appears wins over the hook's (possibly wallet-less) value until the hook updates.
  const freshToken = useRef<{ replaces: string | null; token: string } | null>(null);
  if (freshToken.current && freshToken.current.replaces !== identityToken) freshToken.current = null;
  const identityTokenRef = useRef(identityToken);
  identityTokenRef.current = freshToken.current?.token ?? identityToken;

  const embeddedAddress = embeddedSolanaAddress(user);
  const wallet = useMemo(
    () =>
      wallets.find((candidate) => candidate.address === embeddedAddress) ??
      wallets.find((candidate) => !!candidate.address) ??
      null,
    [wallets, embeddedAddress],
  );
  const walletAddress = wallet?.address ?? embeddedAddress;

  // Layout effect: registered before children's passive effects start fetching.
  useLayoutEffect(() => {
    if (!authenticated) {
      clearIdentityTokenGetter();
      return;
    }
    const getter = async () => {
      const cached = identityTokenRef.current;
      if (cached && !tokenExpiring(cached)) return cached;
      return refreshIdentityToken(() => identityTokenRef.current);
    };
    setIdentityTokenGetter(getter);
    queryClient.invalidateQueries({ queryKey: PRIVATE_QUERY_PREFIX });
    return () => clearIdentityTokenGetter(getter);
  }, [authenticated, queryClient]);

  // The embedded wallet is created after login, so the first identity token (and every private query made with it)
  // can predate it and the API answers "no wallet". When the wallet appears, fetch a fresh token and refetch.
  const lastWallet = useRef(walletAddress);
  useEffect(() => {
    const previous = lastWallet.current;
    lastWallet.current = walletAddress;
    if (!authenticated || !walletAddress || previous === walletAddress) return;
    let cancelled = false;
    const replaces = identityToken;
    getIdentityToken()
      .catch(() => null)
      .then((token) => {
        if (cancelled) return;
        if (token && token !== replaces) {
          freshToken.current = { replaces, token };
          identityTokenRef.current = token;
        }
        queryClient.invalidateQueries({ queryKey: PRIVATE_QUERY_PREFIX });
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, walletAddress, queryClient]);

  const logout = useCallback(async () => {
    clearIdentityTokenGetter();
    queryClient.removeQueries({ queryKey: PRIVATE_QUERY_PREFIX });
    await privyLogout();
  }, [privyLogout, queryClient]);

  const signAndSendTransaction = useMemo<NewsbidAuth["signAndSendTransaction"]>(() => {
    const address = wallet?.address;
    if (!wallet || !address) return null;
    // Swaps arrive pre-signed by Newsbid's fee payer, so the wallet only adds its signature. The
    // exact checked bytes are broadcast through the Newsbid API, never a public RPC from the browser.
    // Privy's own confirmation UI is off: the app already shows a review and a slide-to-confirm.
    return async (base64Transaction: string, options?: { bagId?: string; requestId?: string }) => {
      const transaction = decodeTransaction(base64Transaction);
      const { signedTransaction } = await signTransaction({
        // The exact prepared bytes: the fee payer already signed this message, so it must not change.
        transaction: new Uint8Array(Buffer.from(base64Transaction, "base64")),
        wallet,
        options: { uiOptions: { showWalletUIs: false } },
      });
      const signed = VersionedTransaction.deserialize(signedTransaction);
      assertWalletSigned(transaction, signed, address);
      // Known before broadcasting, so a lost response can still be tracked instead of re-sent.
      const localSignature = transactionSignature(signed);
      try {
        const signature = await submitSignedTransaction(
          Buffer.from(signed.serialize()).toString("base64"),
          options?.bagId,
          options?.requestId,
        );
        return { signature };
      } catch (error) {
        if (!localSignature) throw error;
        const status = error instanceof ApiError ? error.status : 0;
        throw new SubmissionError(
          error instanceof Error ? error.message : "Couldn’t send the swap.",
          localSignature,
          definiteRejection(status),
        );
      }
    };
  }, [wallet, signTransaction]);

  const value = useMemo<NewsbidAuth>(
    () => ({
      configured: true,
      ready,
      authenticated,
      email: user?.email?.address ?? null,
      walletAddress,
      logout,
      signAndSendTransaction,
      // Card onramp is hidden on web: the web SDK doesn't expose whether a card provider is enabled.
      fundWithCard: null,
    }),
    [ready, authenticated, user, walletAddress, logout, signAndSendTransaction],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      {...(PRIVY_CLIENT_ID ? { clientId: PRIVY_CLIENT_ID } : {})}
      config={{
        loginMethods: ["email"],
        appearance: { theme: "light", accentColor: "#2563EB", walletChainType: "solana-only" },
        embeddedWallets: {
          solana: { createOnLogin: "all-users" },
          ethereum: { createOnLogin: "off" },
          showWalletUIs: false,
        },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
