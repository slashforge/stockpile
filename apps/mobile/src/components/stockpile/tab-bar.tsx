import { Ionicons } from "@expo/vector-icons";
import Color from "color";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { lightImpact, selection } from "@/components/utils/haptics";
import { BarBlur, BlurTargetProvider, useBlurTarget } from "./bar-blur";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type TabBarItem = {
  key: string;
  label: string;
  icon: IconName;
  activeIcon: IconName;
};

export const TAB_BAR_HEIGHT = 64;
/** Gap between the pill and the system navigation bar / bottom edge. */
const TAB_BAR_GAP = 10;
const MIN_BOTTOM = 8;

/** Space the floating bar covers from the bottom edge, for a given bottom safe-area inset. */
export function floatingTabBarInset(bottomSafeArea: number) {
  return Math.max(bottomSafeArea, MIN_BOTTOM) + TAB_BAR_GAP + TAB_BAR_HEIGHT;
}

const TabBarInsetContext = createContext(0);

type TabBarVisibility = { hidden: boolean; setHidden: (hidden: boolean) => void };
const TabBarVisibilityContext = createContext<TabBarVisibility>({ hidden: false, setHidden: () => {} });

/** Lets a tab screen hide the tab bar (e.g. while it shows its own selection toolbar). */
export function TabBarVisibilityProvider({ children }: { children: (hidden: boolean) => React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const value = useMemo(() => ({ hidden, setHidden }), [hidden]);
  return <TabBarVisibilityContext.Provider value={value}>{children(hidden)}</TabBarVisibilityContext.Provider>;
}

export function useTabBarHidden() {
  return useContext(TabBarVisibilityContext).hidden;
}

/** Hides the tab bar while `hide` is true; restores it when false or on unmount. */
export function useHideTabBar(hide: boolean) {
  const { setHidden } = useContext(TabBarVisibilityContext);
  useEffect(() => {
    if (!hide) return;
    setHidden(true);
    return () => setHidden(false);
  }, [hide, setHidden]);
}

/** Provides the floating bar's footprint to screens rendered under it. */
export function TabBarInsetProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const hidden = useTabBarHidden();
  return (
    <TabBarInsetContext.Provider value={hidden ? 0 : floatingTabBarInset(insets.bottom)}>
      <BlurTargetProvider>{children}</BlurTargetProvider>
    </TabBarInsetContext.Provider>
  );
}

/**
 * Bottom space a screen must leave for a floating tab bar drawn over it. 0 outside a
 * TabBarInsetProvider (pushed screens, iOS native tabs where UIKit insets content itself).
 */
export function useTabBarInset() {
  return useContext(TabBarInsetContext);
}

function TabButton({
  item,
  active,
  onPress,
  onLongPress,
}: {
  item: TabBarItem;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { theme } = useUnistyles();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const color = active ? theme.ds.accent : theme.ds.inkSecondary;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      testID={`tab-${item.key}`}
      onPressIn={() => {
        scale.set(withSpring(0.9, { damping: 18, stiffness: 400 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
      }}
      onPress={() => {
        // Re-tapping the active tab scrolls to top; a softer tick acknowledges it.
        if (active) selection();
        else lightImpact();
        onPress();
      }}
      onLongPress={onLongPress}
      style={styles.button}
    >
      <Animated.View style={[styles.item, active && styles.itemActive, animated]}>
        <Ionicons name={active ? item.activeIcon : item.icon} size={22} color={color} />
        <Animated.Text
          numberOfLines={1}
          allowFontScaling={false}
          style={[styles.label, { color }, active && styles.labelActive]}
        >
          {item.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Floating pill tab bar: rounded translucent surface hovering above the bottom edge, soft
 * filled highlight on the active item. Position it absolutely so content scrolls beneath, and
 * pad scrollables with `useTabBarInset()`.
 */
export function FloatingTabBar({
  items,
  activeKey,
  onSelect,
  onLongPress,
}: {
  items: TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  onLongPress?: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { target } = useBlurTarget();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, MIN_BOTTOM) + TAB_BAR_GAP }]}
    >
      <View style={styles.shadow}>
        <BarBlur target={target} style={styles.bar}>
          <View accessibilityRole="tablist" style={styles.items}>
            {items.map((item) => (
              <TabButton
                key={item.key}
                item={item}
                active={item.key === activeKey}
                onPress={() => onSelect(item.key)}
                onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}
              />
            ))}
          </View>
        </BarBlur>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  shadow: {
    width: "100%",
    maxWidth: 520,
    height: TAB_BAR_HEIGHT,
    ...theme.rounded(TAB_BAR_HEIGHT / 2),
    shadowColor: "#1B2250",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  bar: {
    flex: 1,
    overflow: "hidden",
    ...theme.rounded(TAB_BAR_HEIGHT / 2),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color(theme.ds.line).alpha(0.6).string(),
  },
  items: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 6 },
  button: { flex: 1, height: "100%", justifyContent: "center" },
  item: {
    height: TAB_BAR_HEIGHT - 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    ...theme.rounded((TAB_BAR_HEIGHT - 12) / 2),
  },
  itemActive: { backgroundColor: theme.ds.accentSoft },
  label: { fontSize: 11, fontWeight: "500", letterSpacing: 0.1 },
  labelActive: { fontWeight: "700" },
}));
