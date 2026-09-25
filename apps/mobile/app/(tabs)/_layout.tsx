import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useUnistyles } from "react-native-unistyles";

/**
 * System tab bar via Expo Router native tabs (react-native-screens bottom tabs).
 * iOS 26+ renders Liquid Glass automatically; earlier iOS uses the standard UITabBar.
 * Android uses the Material bottom navigation with Material Symbols (`md`).
 */
export default function TabsLayout() {
  const { theme } = useUnistyles();
  return (
    <NativeTabs
      tintColor={theme.ds.accent}
      indicatorColor={theme.ds.accentSoft}
      rippleColor={theme.ds.accentSoft}
      labelVisibilityMode="labeled"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "play.rectangle", selected: "play.rectangle.fill" }} md="newspaper" />
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bags">
        <NativeTabs.Trigger.Icon sf={{ default: "square.stack.3d.up", selected: "square.stack.3d.up.fill" }} md="layers" />
        <NativeTabs.Trigger.Label>Bags</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} md="bookmark" />
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="portfolio">
        <NativeTabs.Trigger.Icon sf={{ default: "chart.pie", selected: "chart.pie.fill" }} md="pie_chart" />
        <NativeTabs.Trigger.Label>Portfolio</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
          md="account_circle"
        />
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
