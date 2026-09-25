import {
  PrivyProvider,
  useEmbeddedSolanaWallet,
  useIdentityToken,
  usePrivy,
  usePrivyClient,
} from "@privy-io/expo";
import { PrivyElements, useFundSolanaWallet } from "@privy-io/expo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Buffer } from "buffer";
import React, { useCallback, useEffect, useMemo } from "react";
import { AppState } from "react-native";
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from "@/config/env";
import { PRIVATE_QUERY_PREFIX } from "@/hooks/query-keys";
import {
  cardFundingAvailable,
  type PrivyFundingConfig,
  suggestedFundingAmount,
} from "@/lib/funding";
import { assertWalletSigned, decodeTransaction } from "@/lib/solana/transaction";
import { AuthContext, type StockpileAuth } from "@/providers/auth-context";
import {
  clearIdentityTokenGetter,
  setIdentityTokenGetter,
} from "@/services/api/identity-token";
import { submitSignedTransaction } from "@/services/api/stockpile";

type LinkedAccount = { type?: string; address?: string };

function emailFromUser(user: unknown): string | null {
  const accounts =
    (user as { linked_accounts?: LinkedAccount[] } | null)?.linked_accounts ??
    [];
  return accounts.find((account) => account.type === "email")?.address ?? null;
}

function PrivyBridge({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user, isReady, logout: privyLogout } = usePrivy();
  const { getIdentityToken } = useIdentityToken();
  const { wallets } = useEmbeddedSolanaWallet();
  const authenticated = isReady && !!user;

  const wallet = useMemo(
    () => (wallets ?? []).find((candidate) => !!candidate.address) ?? null,
    [wallets],
  );
  const walletAddress = wallet?.address ?? null;

  useEffect(() => {
    if (!authenticated) {
      clearIdentityTokenGetter();
      return;
    }
    const getter = () => getIdentityToken();
    setIdentityTokenGetter(getter);
    queryClient.invalidateQueries({ queryKey: PRIVATE_QUERY_PREFIX });
    return () => clearIdentityTokenGetter(getter);
  }, [authenticated, getIdentityToken, queryClient]);

  useEffect(() => {
    if (!authenticated) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        getIdentityToken().catch((error) =>
          console.warn("Privy token refresh failed", error),
        );
      }
    });
    return () => subscription.remove();
  }, [authenticated, getIdentityToken]);

  const logout = useCallback(async () => {
    clearIdentityTokenGetter();
    queryClient.removeQueries({ queryKey: PRIVATE_QUERY_PREFIX });
    await privyLogout();
  }, [privyLogout, queryClient]);

  const signAndSendTransaction = useMemo<
    StockpileAuth["signAndSendTransaction"]
  >(() => {
    const address = wallet?.address;
    if (!wallet || !address) return null;
    // Swaps arrive pre-signed by Stockpile's fee payer, so the wallet only adds its signature. The
    // exact checked bytes are broadcast through the Stockpile API (Helius RPC + Sender), never a
    // public RPC from the device.
    return async (base64Transaction: string, options?: { bagId?: string }) => {
      const transaction = decodeTransaction(base64Transaction);
      const provider = await wallet.getProvider();
      const { signedTransaction } = await provider.request({
        method: "signTransaction",
        params: { transaction: decodeTransaction(base64Transaction) },
      });
      assertWalletSigned(transaction, signedTransaction, address);
      const signature = await submitSignedTransaction(
        Buffer.from(signedTransaction.serialize()).toString("base64"),
        options?.bagId,
      );
      return { signature };
    };
  }, [wallet]);

  const client = usePrivyClient();
  const { fundWallet } = useFundSolanaWallet();
  // App config (incl. dashboard funding settings) is loaded by the time the SDK is ready.
  const fundingConfig = isReady
    ? ((client.app.getConfig()?.funding_config ?? null) as PrivyFundingConfig)
    : null;
  const cardAvailable = cardFundingAvailable(fundingConfig);
  const fundWithCard = useMemo<StockpileAuth["fundWithCard"]>(() => {
    if (!walletAddress || !cardAvailable) return null;
    return () =>
      fundWallet({
        address: walletAddress,
        asset: "USDC",
        amount: suggestedFundingAmount(fundingConfig),
        defaultPaymentMethod: "card",
      });
  }, [walletAddress, cardAvailable, fundWallet, fundingConfig]);

  const value = useMemo<StockpileAuth>(
    () => ({
      configured: true,
      ready: isReady,
      authenticated,
      email: emailFromUser(user),
      walletAddress,
      logout,
      signAndSendTransaction,
      fundWithCard,
    }),
    [
      isReady,
      authenticated,
      user,
      walletAddress,
      logout,
      signAndSendTransaction,
      fundWithCard,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      config={{ embedded: { solana: { createOnLogin: "all-users" } } }}
    >
      <PrivyBridge>{children}</PrivyBridge>
      {/* Hosts Privy's own modals (card onramp). Renders nothing until a flow opens. */}
      <PrivyElements />
    </PrivyProvider>
  );
}
