import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { type ReactNode, useState } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { LogoCluster } from "@/components/stockpile/bag-art";
import { TradeSettingsButton, TradeSettingsPopover } from "@/components/stockpile/buy/controls";
import { T } from "@/components/stockpile/type";
import type { PurchaseStatus } from "@/lib/trade/purchase";
import type { BagAsset } from "@/services/api/types";
import { HapticPressable } from "@/components/stockpile/haptic-pressable";

/** What the flow trades: a bag, or a hand-picked set of tokens. */
type FlowSubject = { title: string; assets: Pick<BagAsset, "symbol" | "iconUrl">[] };

type FlowShellProps = {
  bag: FlowSubject | undefined;
  status: PurchaseStatus;
  close: () => void;
  titles: { amount: string; review: string; progress: string };
  slippageBps: number | null;
  onSlippageChange: (bps: number | null) => void;
  children: ReactNode;
};

/** Buy/sell flow frame: header (close left, settings cog right) over the steps, plus the settings popover. */
export function FlowShell({ bag, status, close, titles, slippageBps, onSlippageChange, children }: FlowShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  return (
    <View style={styles.shell}>
      <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
        <FlowHeader
          bag={bag}
          status={status}
          close={close}
          titles={titles}
          settings={
            <TradeSettingsButton
              value={slippageBps}
              open={settingsOpen}
              onPress={() => setSettingsOpen((open) => !open)}
            />
          }
        />
      </View>
      {children}
      <TradeSettingsPopover
        open={settingsOpen}
        top={headerHeight + 4}
        value={slippageBps}
        onChange={onSlippageChange}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}

/**
 * Modal header shared by the buy and sell flows. Left: back on review, otherwise close (hidden
 * while swaps are running). Right: `settings` (the trade settings cog) on the amount step only.
 */
export function FlowHeader({
  bag,
  status,
  close,
  titles,
  settings,
}: {
  bag: FlowSubject | undefined;
  status: PurchaseStatus;
  close: () => void;
  titles: { amount: string; review: string; progress: string };
  settings?: ReactNode;
}) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const onProgress = pathname.endsWith("/progress");
  const showBack = pathname.endsWith("/review");
  const onAmount = !onProgress && !showBack;
  const title = onProgress ? titles.progress : showBack ? titles.review : titles.amount;
  const top = Platform.OS === "ios" ? 14 : insets.top + 8;

  return (
    <View style={[styles.header, { paddingTop: top }]}>
      <View style={styles.side}>
        {showBack ? (
          <HapticPressable
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={20} color={theme.ds.inkSecondary} />
          </HapticPressable>
        ) : status === "running" ? null : (
          <HapticPressable
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={close}
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={20} color={theme.ds.inkSecondary} />
          </HapticPressable>
        )}
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
      <View style={[styles.side, styles.sideEnd]}>{onAmount ? settings : null}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  shell: { flex: 1, backgroundColor: theme.ds.canvas },
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
