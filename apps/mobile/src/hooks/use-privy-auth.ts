import { useState, useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import {
  usePrivy,
  useLoginWithEmail,
  useEmbeddedSolanaWallet,
  useIdentityToken,
} from "@privy-io/expo";
import { privyStorage } from "@/services/privy-storage";
import { setWalletFromPrivy, setOnboardingComplete, hasWallet, isOnboardingComplete } from "@/services/wallet";
import { createOrUpdateLocalUser } from "./use-user";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.__DOMAIN__";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

export type SyncResult = {
  success: boolean;
  error?: string;
  needsSync: boolean;
};

/**
 * Check if the user's local state is in sync with their Privy auth
 */
export async function checkSyncStatus(): Promise<{ needsSync: boolean }> {
  const [wallet, onboarded] = await Promise.all([
    hasWallet(),
    isOnboardingComplete(),
  ]);
  return { needsSync: !wallet || !onboarded };
}

/**
 * Sync user with backend and set up local state.
 * Can be called from login flow or on app reload to recover from failed sync.
 */
export async function syncUserWithBackend(
  getIdentityToken: () => Promise<string | null>,
  email?: string
): Promise<SyncResult> {
  // First check if sync is needed
  const { needsSync } = await checkSyncStatus();
  if (!needsSync) {
    return { success: true, needsSync: false };
  }

  try {
    const identityToken = await getIdentityToken();
    
    if (!identityToken) {
      return { success: false, error: "Failed to get identity token", needsSync: true };
    }

    const syncResponse = await fetch(`${API_URL}/auth/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-id-token": identityToken,
      },
    });

    if (!syncResponse.ok) {
      const errorData = await syncResponse.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.error || "Failed to sync user with backend",
        needsSync: true 
      };
    }

    const syncData = await syncResponse.json();
    const privyUserId = syncData.user.id;
    // Backend returns walletAddress and email
    const walletAddr = syncData.user.walletAddress;
    const userEmail = syncData.user.email || email || "";

    if (!privyUserId || !walletAddr) {
      return { success: false, error: "Invalid response from server", needsSync: true };
    }

    console.log("Sync successful:", { privyUserId, walletAddr, userEmail });

    // Save to privy storage
    await privyStorage.savePrivyUserId(privyUserId);
    await privyStorage.saveWalletAddress(walletAddr);

    // Set up wallet in local DB
    await setWalletFromPrivy({
      address: walletAddr,
      privyUserId: privyUserId,
    });

    // Create/update local user record with email from backend
    await createOrUpdateLocalUser({
      email: userEmail,
      privyUserId: privyUserId,
      walletAddress: walletAddr,
    });

    await setOnboardingComplete();

    return { success: true, needsSync: false };
  } catch (err: any) {
    console.error("Failed to sync user:", err);
    return { success: false, error: err.message || "Sync failed", needsSync: true };
  }
}

type AuthStep = "email" | "otp";

type UsePrivyAuthReturn = {
  step: AuthStep;
  email: string;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  user: any;
  walletAddress: string | null;
  registerEmail: (email: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  goBack: () => void;
  clearError: () => void;
  getIdentityToken: () => Promise<string | null>;
};

export function usePrivyAuth(): UsePrivyAuthReturn {
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Privy hooks
  const { user, isReady, logout: privyLogout } = usePrivy();
  const { sendCode, loginWithCode, state: loginState } = useLoginWithEmail();
  const { wallets } = useEmbeddedSolanaWallet();
  const { getIdentityToken: getPrivyIdentityToken } = useIdentityToken();

  // Get the first embedded Solana wallet (Privy creates one automatically)
  // Per Privy docs, just use the first wallet with an address
  const solanaWallet = useMemo(() => {
    if (!wallets || wallets.length === 0) {
      return null;
    }
    return wallets.find((w: any) => w.address) ?? wallets[0];
  }, [wallets]);

  const walletAddress = solanaWallet?.address ?? null;
  const isAuthenticated = !!user && isReady;

  // Note: Identity token getter is set up in AuthSetup component (root-provider.tsx)
  // to ensure it's available immediately on app start, not just when this hook is used.

  const registerEmail = useCallback(async (emailInput: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Send OTP via Privy
      await sendCode({ email: emailInput });
      setEmail(emailInput);
      setStep("otp");
    } catch (err: any) {
      console.error("Failed to send OTP:", err);
      setError(err.message || "Failed to send verification code");
    } finally {
      setIsLoading(false);
    }
  }, [sendCode]);

  const verifyOtp = useCallback(
    async (otpCode: string) => {
      if (!email) {
        setError("Email not set. Please try again.");
        setStep("email");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Verify OTP with Privy - this logs the user in
        await loginWithCode({ code: otpCode, email });

        // Wait for embedded wallet to be created and synced to Privy servers
        // This can take several seconds on first login
        console.log("OTP verified, waiting for wallet to be created...");
        
        let attempts = 0;
        const maxAttempts = 30; // 30 * 500ms = 15 seconds max wait
        let syncResult: SyncResult | null = null;
        
        while (attempts < maxAttempts) {
          // Wait before each attempt (gives Privy time to create/sync wallet)
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
          
          console.log(`Sync attempt ${attempts}/${maxAttempts}...`);
          
          // Try to sync - backend will check if wallet exists
          syncResult = await syncUserWithBackend(getPrivyIdentityToken, email);
          
          if (syncResult.success) {
            console.log("Sync successful!");
            break;
          }
          
          // If error is about wallet not existing, keep trying
          const errorLower = syncResult.error?.toLowerCase() || "";
          if (errorLower.includes("wallet") || errorLower.includes("solana")) {
            console.log("Wallet not ready yet, retrying...", syncResult.error);
            continue;
          }
          
          // Other errors, stop retrying
          console.log("Non-wallet error, stopping retries:", syncResult.error);
          break;
        }
        
        if (!syncResult?.success) {
          throw new Error(syncResult?.error || "Failed to sync user after multiple attempts");
        }

        router.replace("/(app)/tabs/home");
      } catch (err: any) {
        console.error("Failed to verify OTP:", err);
        setError(err.message || "Invalid verification code");
      } finally {
        setIsLoading(false);
      }
    },
    [email, loginWithCode, getPrivyIdentityToken, router]
  );

  const logout = useCallback(async () => {
    try {
      await privyLogout();
      await privyStorage.clearAll();
    } catch (err: any) {
      console.error("Logout error:", err);
    }
  }, [privyLogout]);

  const goBack = useCallback(() => {
    setStep("email");
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getIdentityToken = useCallback(async (): Promise<string | null> => {
    try {
      return await getPrivyIdentityToken();
    } catch (err) {
      console.error("Failed to get identity token:", err);
      return null;
    }
  }, [getPrivyIdentityToken]);

  // Only show loginState errors when we're actively in an error state AND not loading
  // This prevents stale Privy SDK errors from showing after successful auth
  const displayError = error || (
    !isLoading && 
    loginState.status === "error" && 
    !isAuthenticated 
      ? loginState.error?.message ?? "Authentication failed" 
      : null
  );

  return {
    step,
    email,
    isLoading: isLoading || loginState.status === "sending-code" || loginState.status === "submitting-code",
    error: displayError,
    isAuthenticated,
    user,
    walletAddress,
    registerEmail,
    verifyOtp,
    logout,
    goBack,
    clearError,
    getIdentityToken,
  };
}
