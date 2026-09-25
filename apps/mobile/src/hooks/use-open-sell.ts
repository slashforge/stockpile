import { router } from "expo-router";
import { useCallback } from "react";
import { useSignInSheet } from "@/components/stockpile/sign-in-sheet";

/** Opens the sell flow for a bag. Signed-out users sign in first, then land in the flow. */
export function useOpenSell() {
  const { requestSignIn } = useSignInSheet();
  return useCallback(
    (bagId: string) =>
      requestSignIn(() => router.push({ pathname: "/sell/[bagId]", params: { bagId } })),
    [requestSignIn],
  );
}
