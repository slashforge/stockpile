import { useCallback, useMemo } from "react";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { VersionedTransaction } from "@solana/web3.js";

/**
 * Hook to provide transaction signing capability using Privy embedded wallet.
 * 
 * Returns a signTransaction function that takes a base64-encoded unsigned
 * transaction and returns a base64-encoded signed transaction.
 */
export function useTransactionSigner() {
  const { wallets } = useEmbeddedSolanaWallet();

  // Get the first embedded Solana wallet
  // Per Privy docs, just use wallets[0] - embedded wallets are automatically created
  const wallet = useMemo(() => {
    if (!wallets || wallets.length === 0) {
      return null;
    }
    // Return first wallet that has an address (ready to use)
    return wallets.find((w: any) => w.address) ?? wallets[0];
  }, [wallets]);

  // Check if wallet is truly ready (has address and can provide a provider)
  const isReady = useMemo(() => {
    return !!wallet?.address;
  }, [wallet]);

  const signTransaction = useCallback(
    async (base64Transaction: string): Promise<string> => {
      if (!wallet) {
        throw new Error("No embedded wallet available. Please ensure you are logged in.");
      }

      if (!wallet.address) {
        throw new Error("Wallet not fully initialized. Please wait a moment and try again.");
      }

      // Get the provider from the wallet
      let provider;
      try {
        provider = await wallet.getProvider();
      } catch (err: any) {
        throw new Error(`Failed to get wallet provider: ${err.message}`);
      }

      if (!provider) {
        throw new Error("Wallet provider not available. Please try again.");
      }

      // Decode the unsigned transaction for signing
      const txBuffer = Buffer.from(base64Transaction, "base64");
      const transaction = VersionedTransaction.deserialize(txBuffer);

      // Sign using the provider's signTransaction method
      // The Privy provider expects the actual transaction object
      const result = await provider.request({
        method: "signTransaction",
        params: {
          transaction,
        },
      });

      // The result contains the signed transaction
      if (result && typeof result === "object" && "signedTransaction" in result) {
        const signedTx = result.signedTransaction;
        if (signedTx instanceof VersionedTransaction) {
          return Buffer.from(signedTx.serialize()).toString("base64");
        }
      }

      // Fallback: if we get the transaction directly
      if (result instanceof VersionedTransaction) {
        return Buffer.from(result.serialize()).toString("base64");
      }

      throw new Error("Unexpected signing result format");
    },
    [wallet]
  );

  return {
    signTransaction,
    isReady,
    walletAddress: wallet?.address ?? null,
  };
}
