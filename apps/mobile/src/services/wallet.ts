import * as SecureStore from "expo-secure-store";
import { eq } from "drizzle-orm";
import db from "@/db/index";
import { wallets } from "@/db/schema/index";

const WALLET_ADDRESS_KEY = "riven_wallet_address";
const GRID_USER_ID_KEY = "riven_grid_user_id";
const PRIVY_USER_ID_KEY = "riven_privy_user_id";
const ONBOARDING_KEY = "riven_onboarding_complete";

export type WalletAccount = {
  publicKey: string;
  gridUserId?: string;
  privyUserId?: string;
};

export async function setWalletFromPrivy(params: {
  address: string;
  privyUserId: string;
  name?: string;
}): Promise<WalletAccount> {
  const { address, privyUserId, name } = params;

  await SecureStore.setItemAsync(WALLET_ADDRESS_KEY, address);
  await SecureStore.setItemAsync(PRIVY_USER_ID_KEY, privyUserId);

  await db.insert(wallets).values({
    id: `wallet_${Date.now()}`,
    address,
    gridUserId: privyUserId,
    name: name ?? null,
    isActive: true,
    createdAt: new Date(),
  }).onConflictDoNothing();

  await db
    .update(wallets)
    .set({
      isActive: true,
      gridUserId: privyUserId,
      name: name ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(wallets.address, address));

  return {
    publicKey: address,
    privyUserId,
  };
}

export async function getWallet(): Promise<WalletAccount | null> {
  const address = await SecureStore.getItemAsync(WALLET_ADDRESS_KEY);
  if (!address) return null;

  const gridUserId = await SecureStore.getItemAsync(GRID_USER_ID_KEY);
  const privyUserId = await SecureStore.getItemAsync(PRIVY_USER_ID_KEY);

  return {
    publicKey: address,
    gridUserId: gridUserId ?? undefined,
    privyUserId: privyUserId ?? undefined,
  };
}

export async function hasWallet(): Promise<boolean> {
  const wallet = await getWallet();
  return wallet !== null;
}

export async function deleteWallet(): Promise<void> {
  const wallet = await getWallet();
  if (wallet) {
    const dbWallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.address, wallet.publicKey))
      .limit(1);

    if (dbWallet.length > 0) {
      const walletId = dbWallet[0].id;
      await db.delete(wallets).where(eq(wallets.id, walletId));
    }
  }
  await SecureStore.deleteItemAsync(WALLET_ADDRESS_KEY);
  await SecureStore.deleteItemAsync(GRID_USER_ID_KEY);
  await SecureStore.deleteItemAsync(PRIVY_USER_ID_KEY);
}

export async function isOnboardingComplete(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(ONBOARDING_KEY);
  return value === "true";
}

export async function setOnboardingComplete(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
}

export async function resetOnboarding(): Promise<void> {
  await SecureStore.deleteItemAsync(ONBOARDING_KEY);
}
