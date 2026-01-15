import * as SecureStore from "expo-secure-store";

const KEYS = {
  PRIVY_USER_ID: "privy_user_id",
  WALLET_ADDRESS: "privy_wallet_address",
} as const;

/**
 * Storage service for Privy-related data.
 * 
 * Note: Privy SDK handles its own token storage internally.
 * We only store user ID and wallet address for quick access.
 */
export const privyStorage = {
  async savePrivyUserId(userId: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.PRIVY_USER_ID, userId);
  },

  async getPrivyUserId(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.PRIVY_USER_ID);
  },

  async saveWalletAddress(address: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.WALLET_ADDRESS, address);
  },

  async getWalletAddress(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.WALLET_ADDRESS);
  },

  async clearAll(): Promise<void> {
    await Promise.all(
      Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key))
    );
  },
};
