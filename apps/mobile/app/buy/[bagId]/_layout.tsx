import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams, usePathname } from "expo-router";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { LogoCluster } from "@/components/stockpile/bag-art";
import { BuyFlowProvider, useBuyFlow } from "@/components/stockpile/buy/flow-context";
import { T } from "@/components/stockpile/type";

function Header() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { bag, close, status } = useBuyFlow();
  const onProgress = pathname.endsWith("/progress");
  const showBack = pathname.endsWith("/review");
  const title = onProgress ? "Buying bag" : showBack ? "Review" : "Buy bag";
  const top = Platform.OS === "ios" ? 14 : insets.top + 8;

  return (
    <View style={[styles.header, { paddingTop: top }]}>
      <View style={styles.side}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={20} color={theme.ds.inkSecondary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.center}>
        <T variant="headline" accessibilityRole="header" numberOfLines={1}>
          {title}
        </T>
        <View style={styles.bagRow}>
          {bag.data ? <LogoCluster assets={bag.data.assets} size={18} limit={4} flat /> : null}
          <T variant="caption" tone="secondary" numberOfLines={1} style={styles.shrink}>
            {bag.data?.title ?? " "}
          </T>
        </View>
      </View>
      <View style={[styles.side, styles.sideEnd]}>
        {status === "running" ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={close}
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={20} color={theme.ds.inkSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function BuyLayout() {
  const { bagId } = useLocalSearchParams<{ bagId: string }>();
  const { theme } = useUnistyles();
  return (
    <BuyFlowProvider bagId={bagId}>
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
    </BuyFlowProvider>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.ds.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.density.gutter,
    paddingBottom: 6,
    gap: 8,
  },
  side: { width: 36 },
  sideEnd: { alignItems: "flex-end" },
  center: { flex: 1, alignItems: "center", gap: 3 },
  bagRow: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  shrink: { flexShrink: 1 },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.sunken,
  },
  pressed: { opacity: 0.6 },
}));
