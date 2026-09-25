import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PRIVY_CONFIGURED } from "@/config/env";
import { useStockpileAuth } from "@/providers/auth-context";
import { NativeSheet } from "./native-sheet";
import { T } from "./type";

type LoginModule = typeof import("@/lib/privy/privy-login-form");

const PrivyLoginForm: LoginModule["PrivyLoginForm"] | null = PRIVY_CONFIGURED
  ? (require("@/lib/privy/privy-login-form") as LoginModule).PrivyLoginForm
  : null;

/** Delay before running the follow-up action so the dismissing sheet never collides with the next one. */
const HANDOFF_MS = 450;

type SignInSheetValue = {
  /** Opens the sign-in sheet; `then` runs once the user is signed in (immediately if already signed in). */
  requestSignIn: (then?: () => void) => void;
};

const SignInSheetContext = createContext<SignInSheetValue>({ requestSignIn: () => {} });

export function useSignInSheet() {
  return useContext(SignInSheetContext);
}

function SignInArt() {
  const { theme } = useUnistyles();
  return (
    <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={theme.gradients.blue} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.artMain}>
        <Ionicons name="mail" size={26} color="#FFFFFF" />
      </LinearGradient>
      <View style={[styles.artBubble, styles.artMint]}>
        <Ionicons name="shield-checkmark" size={16} color="#FFFFFF" />
      </View>
      <View style={[styles.artBubble, styles.artCoral]}>
        <Ionicons name="wallet" size={15} color="#FFFFFF" />
      </View>
    </View>
  );
}

export function SignInSheetProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useUnistyles();
  const { authenticated } = useStockpileAuth();
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
    setOpen(false);
    const next = pending.current;
    pending.current = null;
    if (next) setTimeout(next, HANDOFF_MS);
  }, []);

  const dismiss = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  const value = useMemo(() => ({ requestSignIn }), [requestSignIn]);

  return (
    <SignInSheetContext.Provider value={value}>
      {children}
      <NativeSheet isPresented={open} onDismiss={dismiss} fit testID="sign-in-sheet">
        <View style={styles.content}>
          <SignInArt />
          {PrivyLoginForm ? (
            <PrivyLoginForm key={formKey} onSuccess={finish} />
          ) : (
            <View style={styles.unconfigured}>
              <T variant="title2">Sign-in isn’t set up</T>
              <T variant="callout" tone="secondary">
                This build has no Privy app configured, so you can browse but not sign in.
              </T>
            </View>
          )}
          <View style={styles.assurance}>
            <Ionicons name="lock-closed" size={13} color={theme.ds.inkTertiary} />
            <T variant="caption" tone="tertiary" style={styles.flex}>
              No password. Your wallet is self-custodial and only you can approve transactions.
            </T>
          </View>
        </View>
      </NativeSheet>
    </SignInSheetContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { gap: 14, paddingTop: theme.density.sheetTop },
  art: { height: 72, width: 120 },
  artMain: {
    position: "absolute",
    left: 0,
    top: 4,
    width: 64,
    height: 64,
    ...theme.rounded(22),
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-6deg" }],
  },
  artBubble: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: theme.ds.surface,
  },
  artMint: { left: 52, top: 0, width: 38, height: 38, ...theme.rounded(14), backgroundColor: theme.ds.mint },
  artCoral: { left: 56, top: 36, width: 34, height: 34, ...theme.rounded(12), backgroundColor: theme.ds.coral },
  unconfigured: { gap: 8 },
  assurance: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  flex: { flex: 1 },
}));
