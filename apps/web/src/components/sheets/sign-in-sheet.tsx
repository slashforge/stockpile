import { createContext, lazy, type ReactNode, Suspense, useCallback, useContext, useMemo, useRef, useState } from "react";
import { IoLockClosed, IoMail, IoShieldCheckmark, IoWallet } from "react-icons/io5";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { PRIVY_CONFIGURED } from "@/config/env";
import { useStockpileAuth } from "@/providers/auth-context";
import { usePrivyMounted } from "@/providers/root-provider";
import { Sheet } from "./sheet";

const PrivyLoginForm = PRIVY_CONFIGURED
  ? lazy(() => import("@/lib/privy/privy-login-form").then((mod) => ({ default: mod.PrivyLoginForm })))
  : null;

type SignInSheetValue = {
  /** Opens the sign-in sheet; `then` runs once the user is signed in (immediately if already signed in). */
  requestSignIn: (then?: () => void) => void;
};

const SignInSheetContext = createContext<SignInSheetValue>({ requestSignIn: () => {} });

export function useSignInSheet() {
  return useContext(SignInSheetContext);
}

function SignInArt() {
  return (
    <div className="relative h-[72px] w-[120px]" aria-hidden>
      <div className="grad-blue absolute left-0 top-1 flex size-16 -rotate-6 items-center justify-center rounded-[22px] text-white">
        <IoMail size={26} />
      </div>
      <div className="absolute left-[52px] top-0 flex size-[38px] items-center justify-center rounded-[14px] border-[3px] border-canvas bg-mint text-white">
        <IoShieldCheckmark size={16} />
      </div>
      <div className="absolute left-14 top-9 flex size-[34px] items-center justify-center rounded-xl border-[3px] border-canvas bg-coral text-white">
        <IoWallet size={15} />
      </div>
    </div>
  );
}

export function SignInSheetProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useStockpileAuth();
  const privyMounted = usePrivyMounted();
  const [open, setOpen] = useState(false);
  // Remount the form on every open so a previous attempt never leaks into the next.
  const [formKey, setFormKey] = useState(0);
  const pending = useRef<(() => void) | null>(null);

  const requestSignIn = useCallback(
    (then?: () => void) => {
      if (authenticated) {
        then?.();
        return;
      }
      pending.current = then ?? null;
      setFormKey((key) => key + 1);
      setOpen(true);
    },
    [authenticated],
  );

  const finish = useCallback(() => {
    toast.success("Signed in");
    setOpen(false);
    const next = pending.current;
    pending.current = null;
    if (next) setTimeout(next, 200);
  }, []);

  const dismiss = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  const value = useMemo(() => ({ requestSignIn }), [requestSignIn]);

  return (
    <SignInSheetContext.Provider value={value}>
      {children}
      <Sheet open={open} onClose={dismiss} label="Sign in" size="sm">
        <div className="flex flex-col gap-3.5 overflow-y-auto p-5 pt-6">
          <SignInArt />
          {PrivyLoginForm ? (
            privyMounted ? (
              <Suspense fallback={<Skeleton height={160} radius={18} />}>
                <PrivyLoginForm key={formKey} onSuccess={finish} />
              </Suspense>
            ) : (
              <Skeleton height={160} radius={18} />
            )
          ) : (
            <div className="flex flex-col gap-2">
              <T variant="title2">Sign-in isn’t set up</T>
              <T variant="callout" tone="secondary">
                This build has no Privy app configured, so you can browse but not sign in.
              </T>
            </div>
          )}
          <div className="flex items-start gap-1.5 text-ink-3">
            <IoLockClosed size={13} className="mt-0.5 shrink-0" />
            <T variant="caption" tone="tertiary">
              No password. Your wallet is self-custodial and only you can approve transactions.
            </T>
          </div>
        </div>
      </Sheet>
    </SignInSheetContext.Provider>
  );
}
