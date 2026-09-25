import { LinearGradient } from "expo-linear-gradient";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { rounded } from "@/config/sizing";
import type { GradientName } from "@/config/theme";

/** Rounded gradient surface with soft decorative circles, for hero cards (wallet, profile, sign-in). */
export function GradientCard({
  gradient = "blue",
  children,
  style,
}: {
  gradient?: GradientName;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={[styles.card, style]}>
      <LinearGradient
        colors={theme.gradients[gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 60" preserveAspectRatio="xMaxYMin slice" pointerEvents="none">
        <Circle cx={96} cy={4} r={26} fill="#FFFFFF" fillOpacity={0.14} />
        <Circle cx={72} cy={62} r={16} fill="#FFFFFF" fillOpacity={0.1} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...rounded(28),
    overflow: "hidden",
    padding: 20,
    gap: 12,
  },
});
