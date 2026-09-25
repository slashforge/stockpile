import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FlowHeader } from "@/components/stockpile/buy/flow-header";
import { SellFlowProvider, useSellFlow } from "@/components/stockpile/buy/sell-flow-context";

const TITLES = { amount: "Sell bag", review: "Review", progress: "Selling bag" };

function Header() {
  const { bag, close, status } = useSellFlow();
  return <FlowHeader bag={bag.data} status={status} close={close} titles={TITLES} />;
}

export default function SellLayout() {
  const { bagId } = useLocalSearchParams<{ bagId: string }>();
  const { theme } = useUnistyles();
  return (
    <SellFlowProvider bagId={bagId}>
      <View style={styles.root}>
        <Header />
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
      </View>
    </SellFlowProvider>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.ds.canvas },
}));
