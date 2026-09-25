import { Stack, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useUnistyles } from "react-native-unistyles";
import { BuyFlowProvider, useBuyFlow } from "@/components/stockpile/buy/flow-context";
import { FlowShell } from "@/components/stockpile/buy/flow-header";

const TITLES = { amount: "Buy bag", review: "Review", progress: "Buying bag" };

function Shell({ children }: { children: ReactNode }) {
  const { bag, close, status, slippageBps, setSlippageBps, prepare } = useBuyFlow();
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

export default function BuyLayout() {
  const { bagId } = useLocalSearchParams<{ bagId: string }>();
  const { theme } = useUnistyles();
  return (
    <BuyFlowProvider bagId={bagId}>
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
    </BuyFlowProvider>
  );
}
