import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { GradientName } from "@/config/theme";
import type { BagAsset } from "@/services/api/types";
import { LogoCluster } from "./bag-art";
import { PrimaryButton } from "./primary-button";
import { T } from "./type";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * Illustrated state for empty, signed-out and unavailable screens: a gradient panel with floating
 * icon tiles (or real token logos), a short title, one line of context and a single clear action.
 */
export function HeroState({
  gradient = "blue",
  icon,
  accents = [],
  logos,
  title,
  body,
  actionLabel,
  actionIcon,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
}: {
  gradient?: GradientName;
  icon: IconName;
  accents?: IconName[];
  logos?: BagAsset[];
  title: string;
  body?: string | null;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
}) {
  const { theme } = useUnistyles();
  const accentColors = [theme.ds.mint, theme.ds.coral, theme.ds.sun];
  return (
    <View style={styles.wrap}>
      <View style={[styles.panel, compact && styles.panelCompact]}>
        <LinearGradient
          colors={theme.gradients[gradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
          <Circle cx={92} cy={6} r={30} fill="#FFFFFF" fillOpacity={0.14} />
          <Circle cx={6} cy={66} r={22} fill="#FFFFFF" fillOpacity={0.12} />
          <Circle cx={30} cy={14} r={1.2} fill="#FFFFFF" fillOpacity={0.7} />
          <Circle cx={74} cy={52} r={1} fill="#FFFFFF" fillOpacity={0.6} />
        </Svg>
        <View style={styles.center} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {logos && logos.length > 0 ? (
            <LogoCluster assets={logos} size={compact ? 52 : 64} limit={4} />
          ) : (
            <View>
              <View style={styles.mainTile}>
                <Ionicons name={icon} size={compact ? 30 : 36} color={theme.ds.accent} />
              </View>
              {accents.slice(0, 3).map((accent, index) => (
                <View
                  key={accent}
                  style={[styles.accentTile, ACCENT_POSITIONS[index], { backgroundColor: accentColors[index] }]}
                >
                  <Ionicons name={accent} size={16} color="#FFFFFF" />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
      <View style={styles.text}>
        <T variant="title2" align="center" accessibilityRole="header">
          {title}
        </T>
        {body ? (
          <T variant="callout" tone="secondary" align="center" style={styles.body}>
            {body}
          </T>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} icon={actionIcon} onPress={onAction} style={styles.action} />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <PrimaryButton label={secondaryLabel} onPress={onSecondary} variant="ghost" size="md" />
      ) : null}
    </View>
  );
}

const ACCENT_POSITIONS = [
  { top: -18, right: -30, transform: [{ rotate: "10deg" }] },
  { bottom: -14, left: -34, transform: [{ rotate: "-12deg" }] },
  { bottom: -20, right: -22, transform: [{ rotate: "6deg" }] },
] as const;

const styles = StyleSheet.create((theme) => ({
  wrap: { gap: 16, alignItems: "stretch" },
  panel: {
    height: 220,
    ...theme.rounded(32),
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  panelCompact: { height: 176 },
  center: { alignItems: "center", justifyContent: "center" },
  mainTile: {
    width: 84,
    height: 84,
    ...theme.rounded(28),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "-6deg" }],
    shadowColor: "#10131F",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  accentTile: {
    position: "absolute",
    width: 40,
    height: 40,
    ...theme.rounded(14),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
  },
  text: { gap: 6, paddingHorizontal: 12 },
  body: { alignSelf: "center", maxWidth: 320 },
  action: { marginTop: 2 },
}));
