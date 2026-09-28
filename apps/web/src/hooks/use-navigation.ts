import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useSignInSheet } from "@/components/sheets/sign-in-sheet";

/** Opens the buy flow for a bag. Signed-out users sign in first, then land in the flow. */
export function useOpenBuy() {
  const { requestSignIn } = useSignInSheet();
  const navigate = useNavigate();
  return useCallback(
    (bagId: string) => requestSignIn(() => navigate({ to: "/buy/$bagId", params: { bagId } })),
    [requestSignIn, navigate],
  );
}

/** Opens the sell flow for a bag position. */
export function useOpenSell() {
  const { requestSignIn } = useSignInSheet();
  const navigate = useNavigate();
  return useCallback(
    (bagId: string) => requestSignIn(() => navigate({ to: "/sell/$bagId", params: { bagId } })),
    [requestSignIn, navigate],
  );
}

export function useCopy() {
  return useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
  }, []);
}
