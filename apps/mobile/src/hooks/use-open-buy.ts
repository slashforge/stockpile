import { router } from "expo-router";
import { useCallback } from "react";
import { useSignInSheet } from "@/components/stockpile/sign-in-sheet";

/** Opens the buy flow for a bag. Signed-out users sign in first, then land in the flow. */
export function useOpenBuy() {
  const { requestSignIn } = useSignInSheet();
  return useCallback(
    (bagId: string) =>
      requestSignIn(() => router.push({ pathname: "/buy/[bagId]", params: { bagId } })),
    [requestSignIn],
  );
}
