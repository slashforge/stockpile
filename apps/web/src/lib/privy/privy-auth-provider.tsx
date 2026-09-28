import { getIdentityToken, PrivyProvider, useIdentityToken, usePrivy, type User } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { VersionedTransaction } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from "@/config/env";
import { PRIVATE_QUERY_PREFIX } from "@/hooks/query-keys";
import { assertWalletSigned, decodeTransaction } from "@/lib/solana/transaction";
import { AuthContext, type StockpileAuth } from "@/providers/auth-context";
import { clearIdentityTokenGetter, setIdentityTokenGetter } from "@/services/api/identity-token";
import { submitSignedTransaction } from "@/services/api/stockpile";

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
  const identityTokenRef = useRef(identityToken);
  identityTokenRef.current = identityToken;

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
    const getter = async () => identityTokenRef.current ?? (await getIdentityToken());
    setIdentityTokenGetter(getter);
    queryClient.invalidateQueries({ queryKey: PRIVATE_QUERY_PREFIX });
    return () => clearIdentityTokenGetter(getter);
  }, [authenticated, queryClient]);

  const logout = useCallback(async () => {
    clearIdentityTokenGetter();
    queryClient.removeQueries({ queryKey: PRIVATE_QUERY_PREFIX });
    await privyLogout();
  }, [privyLogout, queryClient]);

  const signAndSendTransaction = useMemo<StockpileAuth["signAndSendTransaction"]>(() => {
    const address = wallet?.address;
    if (!wallet || !address) return null;
    // Swaps arrive pre-signed by Stockpile's fee payer, so the wallet only adds its signature. The
    // exact checked bytes are broadcast through the Stockpile API, never a public RPC from the browser.
    // Privy's own confirmation UI is off: the app already shows a review and a slide-to-confirm.
    return async (base64Transaction: string, options?: { bagId?: string }) => {
      const transaction = decodeTransaction(base64Transaction);
      const { signedTransaction } = await signTransaction({
        transaction: decodeTransaction(base64Transaction).serialize(),
        wallet,
        options: { uiOptions: { showWalletUIs: false } },
      });
      const signed = VersionedTransaction.deserialize(signedTransaction);
      assertWalletSigned(transaction, signed, address);
      const signature = await submitSignedTransaction(
        Buffer.from(signed.serialize()).toString("base64"),
        options?.bagId,
      );
      return { signature };
    };
  }, [wallet, signTransaction]);

  const value = useMemo<StockpileAuth>(
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
