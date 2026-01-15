import React, { memo, useEffect } from "react";
import { PrivyProvider, usePrivy, useIdentityToken } from "@privy-io/expo";
import { UpdateNotificationManager } from "@/components/update-notification-manager";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SonnerOverlay } from "../components/ui/sonner-overlay";
import { setIdentityTokenGetter, clearIdentityTokenGetter } from "@/services/api/client";

import { NetworkErrorProvider } from "./network-error-provider";
import { QueryProvider } from "./query-provider";
import { QueryClearProvider } from "./query-clear-provider";
import { SonnerProvider } from "./sonner-provider";
import { ThemeContextProvider } from "./theme-context";
import { ThemeProvider } from "./theme-provider";

/**
 * Sets up the identity token getter for authenticated API calls.
 * Must be rendered inside PrivyProvider.
 */
const AuthSetup = memo(({ children }: { children: React.ReactNode }) => {
  const { user, isReady } = usePrivy();
  const { getIdentityToken } = useIdentityToken();
  const isAuthenticated = !!user && isReady;

  useEffect(() => {
    if (isAuthenticated) {
      setIdentityTokenGetter(getIdentityToken);
    } else {
      clearIdentityTokenGetter();
    }
  }, [isAuthenticated, getIdentityToken]);

  return <>{children}</>;
});
AuthSetup.displayName = "AuthSetup";

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || "";
const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || "";

console.log("privy creds: ", PRIVY_APP_ID, PRIVY_CLIENT_ID);

const CoreProviders = memo(({ children }: { children: React.ReactNode }) => (
  <ThemeContextProvider>
    <ThemeProvider>
      <SonnerProvider>
        <NetworkErrorProvider>{children}</NetworkErrorProvider>
      </SonnerProvider>
    </ThemeProvider>
  </ThemeContextProvider>
));
CoreProviders.displayName = "CoreProviders";

const AuthProviders = memo(({ children }: { children: React.ReactNode }) => (
    <QueryProvider>
      <QueryClearProvider>{children}</QueryClearProvider>
    </QueryProvider>
));
AuthProviders.displayName = "AuthProviders";

const Overlays = memo(() => (
  <>
    <UpdateNotificationManager />
    <SonnerOverlay />
  </>
));
Overlays.displayName = "Overlays";

export const RootProvider = memo(
  ({ children }: { children: React.ReactNode }) => {
    return (
      <PrivyProvider
        appId={PRIVY_APP_ID}
        clientId={PRIVY_CLIENT_ID}
        config={{
          embedded: {
            solana: {
              createOnLogin: "all-users",
            },
          },
        }}
      >
        <AuthSetup>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <CoreProviders>
              <KeyboardProvider>
                <AuthProviders>
                  <BottomSheetModalProvider>
                    {children}
                    <Overlays />
                  </BottomSheetModalProvider>
                </AuthProviders>
              </KeyboardProvider>
            </CoreProviders>
          </GestureHandlerRootView>
        </AuthSetup>
      </PrivyProvider>
    );
  }
);
RootProvider.displayName = "RootProvider";
