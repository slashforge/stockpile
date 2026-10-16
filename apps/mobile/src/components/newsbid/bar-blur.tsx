import Color from "color";
import { BlurView } from "expo-blur";
import { createContext, useContext, useState, type RefObject } from "react";
import { Platform, type StyleProp, type View, type ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";

type Target = RefObject<View | null> | undefined;

/**
 * Android blur samples a `BlurTargetView`; the tab bar lives outside each screen, so the focused
 * screen publishes its target here. iOS blurs whatever is behind and ignores this.
 */
const BlurTargetContext = createContext<{ target: Target; setTarget: (target: Target) => void }>({
  target: undefined,
  setTarget: () => {},
});

export function BlurTargetProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<Target>(undefined);
  return <BlurTargetContext.Provider value={{ target, setTarget }}>{children}</BlurTargetContext.Provider>;
}

export function useBlurTarget() {
  return useContext(BlurTargetContext);
}

/** Frosted chrome for headers, footers and the tab bar, tinted with the canvas color. */
export function BarBlur({
  style,
  target,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  target?: Target;
  children?: React.ReactNode;
}) {
  const { theme, rt } = useUnistyles();
  const dark = rt.themeName === "dark";
  const tint = Platform.OS === "ios" ? (dark ? "systemChromeMaterialDark" : "systemChromeMaterialLight") : dark ? "dark" : "light";
  return (
    <BlurView
      intensity={Platform.OS === "ios" ? 80 : 60}
      tint={tint}
      blurMethod="dimezisBlurView"
      blurTarget={target}
      style={[{ backgroundColor: Color(theme.ds.canvas).alpha(Platform.OS === "ios" ? 0.55 : 0.7).string() }, style]}
    >
      {children}
    </BlurView>
  );
}
