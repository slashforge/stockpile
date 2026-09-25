import { createContext, useContext } from "react";

export type SubmittedTransaction = { signature: string };

export type StockpileAuth = {
  /** Privy IDs present in this build. When false the app is browse-only. */
  configured: boolean;
  /** Privy SDK finished restoring the session. */
  ready: boolean;
  authenticated: boolean;
  email: string | null;
  /** Privy embedded Solana wallet address, once created. */
  walletAddress: string | null;
  logout: () => Promise<void>;
  /**
   * Asks the embedded wallet to sign and submit one base64 transaction.
   * Null when no wallet is available.
   */
  signAndSendTransaction:
    ((base64Transaction: string) => Promise<SubmittedTransaction>) | null;
  /**
   * Opens Privy's card onramp to buy USDC into the embedded wallet. Null unless a card provider
   * is enabled in the Privy dashboard and the wallet exists, so callers can hide the button.
   */
  fundWithCard: (() => Promise<void>) | null;
};

export const browseOnlyAuth: StockpileAuth = {
  configured: false,
  ready: true,
  authenticated: false,
  email: null,
  walletAddress: null,
  logout: async () => {},
  signAndSendTransaction: null,
  fundWithCard: null,
};

export const AuthContext = createContext<StockpileAuth>(browseOnlyAuth);

export function useStockpileAuth(): StockpileAuth {
  return useContext(AuthContext);
}
