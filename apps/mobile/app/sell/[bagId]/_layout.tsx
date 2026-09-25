import { Stack, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useUnistyles } from "react-native-unistyles";
import { FlowShell } from "@/components/stockpile/buy/flow-header";
import { SellFlowProvider, useSellFlow } from "@/components/stockpile/buy/sell-flow-context";

const TITLES = { amount: "Sell bag", review: "Review", progress: "Selling bag" };

function Shell({ children }: { children: ReactNode }) {
  const { bag, close, status, slippageBps, setSlippageBps, prepare } = useSellFlow();
  return (
    <FlowShell
      bag={bag.data}
      status={status}
      close={close}
      titles={TITLES}
      slippageBps={slippageBps}
      onSlippageChange={(bps) => {
        setSlippageBps(bps);
        prepare.reset();
      }}
    >
      {children}
    </FlowShell>
  );
}

export default function SellLayout() {
  const { bagId } = useLocalSearchParams<{ bagId: string }>();
  const { theme } = useUnistyles();
  return (
    <SellFlowProvider bagId={bagId}>
      <Shell>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.ds.canvas },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="review" />
          <Stack.Screen name="progress" options={{ gestureEnabled: false }} />
        </Stack>
      </Shell>
    </SellFlowProvider>
  );
}
