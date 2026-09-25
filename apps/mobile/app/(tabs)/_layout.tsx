import { Tabs, type BottomTabBarProps } from "expo-router/tabs";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import {
  FloatingTabBar,
  TabBarInsetProvider,
  TabBarVisibilityProvider,
  useTabBarHidden,
  type TabBarItem,
} from "@/components/stockpile/tab-bar";

/** Route names double as keys; keep in the same order as the iOS triggers. */
const ITEMS: TabBarItem[] = [
  { key: "index", label: "Feed", icon: "newspaper-outline", activeIcon: "newspaper" },
  { key: "bags", label: "Bags", icon: "layers-outline", activeIcon: "layers" },
  { key: "saved", label: "Saved", icon: "bookmark-outline", activeIcon: "bookmark" },
  { key: "portfolio", label: "Portfolio", icon: "pie-chart-outline", activeIcon: "pie-chart" },
  { key: "account", label: "Account", icon: "person-circle-outline", activeIcon: "person-circle" },
];

/** iOS: system tab bar via Expo Router native tabs (Liquid Glass on iOS 26+). */
function IosTabs({ hidden }: { hidden: boolean }) {
  const { theme } = useUnistyles();
  return (
    <NativeTabs tintColor={theme.ds.accent} hidden={hidden}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "play.rectangle", selected: "play.rectangle.fill" }} />
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bags">
        <NativeTabs.Trigger.Icon sf={{ default: "square.stack.3d.up", selected: "square.stack.3d.up.fill" }} />
        <NativeTabs.Trigger.Label>Bags</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} />
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="portfolio">
        <NativeTabs.Trigger.Icon sf={{ default: "chart.pie", selected: "chart.pie.fill" }} />
        <NativeTabs.Trigger.Label>Portfolio</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function AndroidTabBar({ state, navigation }: BottomTabBarProps) {
  const hidden = useTabBarHidden();
  const focused = state.routes[state.index];
  const emitPress = (key: string) => {
    const route = state.routes.find((candidate) => candidate.name === key);
    if (!route) return null;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    return { route, event };
  };
  if (hidden) return null;
  return (
    <FloatingTabBar
      items={ITEMS}
      activeKey={focused.name}
      onSelect={(key) => {
        const pressed = emitPress(key);
        if (pressed && pressed.route.key !== focused.key && !pressed.event.defaultPrevented) {
          navigation.navigate(pressed.route.name, pressed.route.params);
        }
      }}
      onLongPress={(key) => {
        const route = state.routes.find((candidate) => candidate.name === key);
        if (route) navigation.emit({ type: "tabLongPress", target: route.key });
      }}
    />
  );
}

/** Android: JS tabs with a floating pill bar drawn over the content (content scrolls beneath). */
function AndroidTabs() {
  return (
    <TabBarInsetProvider>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AndroidTabBar {...props} />}>
        {ITEMS.map((item) => (
          <Tabs.Screen key={item.key} name={item.key} options={{ title: item.label }} />
        ))}
      </Tabs>
    </TabBarInsetProvider>
  );
}

export default function TabsLayout() {
  return (
    <TabBarVisibilityProvider>
      {(hidden) => (Platform.OS === "ios" ? <IosTabs hidden={hidden} /> : <AndroidTabs />)}
    </TabBarVisibilityProvider>
  );
}
