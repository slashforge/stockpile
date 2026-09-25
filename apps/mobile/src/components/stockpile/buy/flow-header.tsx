import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { LogoCluster } from "@/components/stockpile/bag-art";
import { T } from "@/components/stockpile/type";
import type { PurchaseStatus } from "@/lib/trade/purchase";
import type { Bag } from "@/services/api/types";

/** Modal header shared by the buy and sell flows: back on review, close unless swaps are running. */
export function FlowHeader({
  bag,
  status,
  close,
  titles,
}: {
  bag: Bag | undefined;
  status: PurchaseStatus;
  close: () => void;
  titles: { amount: string; review: string; progress: string };
}) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const onProgress = pathname.endsWith("/progress");
  const showBack = pathname.endsWith("/review");
  const title = onProgress ? titles.progress : showBack ? titles.review : titles.amount;
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
          {bag ? <LogoCluster assets={bag.assets} size={18} limit={4} flat /> : null}
          <T variant="caption" tone="secondary" numberOfLines={1} style={styles.shrink}>
            {bag?.title ?? " "}
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

const styles = StyleSheet.create((theme) => ({
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
