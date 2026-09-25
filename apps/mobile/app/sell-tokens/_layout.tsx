import { Stack, useGlobalSearchParams } from "expo-router";
import { type ReactNode, useState } from "react";
import { useUnistyles } from "react-native-unistyles";
import { FlowShell } from "@/components/stockpile/buy/flow-header";
import { TokenSellFlowProvider, useTokenSellFlow } from "@/components/stockpile/sell-tokens/flow-context";

const TITLES = { amount: "Sell tokens", review: "Review", progress: "Selling tokens" };

function Shell({ children }: { children: ReactNode }) {
  const { subject, close, status, slippageBps, setSlippageBps, prepare } = useTokenSellFlow();
  return (
    <FlowShell
      bag={subject}
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

export default function SellTokensLayout() {
  const params = useGlobalSearchParams<{ mints?: string }>();
  // Captured once: later steps are pushed without the query param.
  const [mints] = useState(() => [...new Set((params.mints ?? "").split(",").filter(Boolean))]);
  const { theme } = useUnistyles();
  return (
    <TokenSellFlowProvider mints={mints}>
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
    </TokenSellFlowProvider>
  );
}
