import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useUnistyles } from "react-native-unistyles";
import { BagSheetProvider } from "@/components/stockpile/bag-sheet";
import { FundSheetProvider } from "@/components/stockpile/fund-sheet";
import { SignInSheetProvider } from "@/components/stockpile/sign-in-sheet";
import { RouteTour } from "@/components/dev/route-tour";
import { RootProvider } from "@/providers/root-provider";

SplashScreen.preventAutoHideAsync();

function AppStack() {
  const { theme } = useUnistyles();

  return (
    <SignInSheetProvider>
      <FundSheetProvider>
        <BagSheetProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.ds.canvas },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="bag/[id]" />
            <Stack.Screen
              name="asset/[symbol]"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen
              name="buy/[bagId]"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen
              name="sell/[bagId]"
              options={{ presentation: "modal" }}
            />
          </Stack>
          <RouteTour />
        </BagSheetProvider>
      </FundSheetProvider>
    </SignInSheetProvider>
  );
}

function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <RootProvider>
      <AppStack />
    </RootProvider>
  );
}

export default RootLayout;
