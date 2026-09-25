import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { GradientName } from "@/config/theme";
import type { Bag } from "@/services/api/types";
import { TokenAvatar } from "./token-avatar";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Decorative theme cue derived from the bag's own title/subtitle words.
const THEMES: { pattern: RegExp; icon: IconName; gradient: GradientName }[] = [
  { pattern: /\b(ai|compute|chip|semi|hardware|infrastructure)\b/i, icon: "hardware-chip", gradient: "blue" },
  { pattern: /\b(consumer|commerce|retail|shopping|entertainment)\b/i, icon: "bag-handle", gradient: "coral" },
  { pattern: /\b(energy|power|utilit|grid|solar)\b/i, icon: "flash", gradient: "mint" },
  { pattern: /\b(health|bio|pharma|medic)\b/i, icon: "medkit", gradient: "lilac" },
  { pattern: /\b(financ|bank|payment|fintech)\b/i, icon: "card", gradient: "sky" },
  { pattern: /\b(megacap|platform|builder|software|cloud|computing)\b/i, icon: "layers", gradient: "lilac" },
];
const FALLBACK: GradientName[] = ["blue", "mint", "coral", "lilac", "sky"];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function bagTheme(bag: Pick<Bag, "id" | "title" | "subtitle">) {
  const text = `${bag.title} ${bag.subtitle}`;
  const match = THEMES.find(({ pattern }) => pattern.test(text));
  return match ?? { icon: "albums" as IconName, gradient: FALLBACK[hash(bag.id) % FALLBACK.length] };
}

/** Abstract, deterministic shapes so every bag has its own motif. */
function Motif({ seed, width, height }: { seed: number; width: number; height: number }) {
  const r1 = height * (0.55 + (seed % 5) * 0.06);
  const r2 = height * (0.3 + (seed % 3) * 0.08);
  const wave = height * (0.62 + (seed % 4) * 0.05);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle cx={width * 0.92} cy={height * 0.1} r={r1} fill="#FFFFFF" fillOpacity={0.14} />
      <Circle cx={width * 0.08} cy={height * 0.95} r={r2} fill="#FFFFFF" fillOpacity={0.12} />
      <Path
        d={`M0 ${wave} C ${width * 0.3} ${wave - height * 0.28}, ${width * 0.6} ${wave + height * 0.24}, ${width} ${wave - height * 0.1} L ${width} ${height} L 0 ${height} Z`}
        fill="#FFFFFF"
        fillOpacity={0.1}
      />
      <Circle cx={width * 0.62} cy={height * 0.2} r={3} fill="#FFFFFF" fillOpacity={0.6} />
      <Circle cx={width * 0.7} cy={height * 0.3} r={2} fill="#FFFFFF" fillOpacity={0.5} />
      <Circle cx={width * 0.18} cy={height * 0.25} r={2.5} fill="#FFFFFF" fillOpacity={0.45} />
    </Svg>
  );
}

/** Overlapping cluster of real token logos (monogram fallback) with white rings. */
export function LogoCluster({
  assets,
  size = 56,
  limit = 4,
}: {
  assets: Bag["assets"];
  size?: number;
  limit?: number;
}) {
  const shown = assets.slice(0, limit);
  const rest = assets.length - shown.length;
  const overlap = size * 0.28;
  return (
    <View style={styles.cluster} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shown.map((asset, index) => (
        <View
          key={`${asset.symbol}-${index}`}
          style={[
            styles.clusterItem,
            { marginLeft: index === 0 ? 0 : -overlap, zIndex: shown.length - index, borderRadius: size },
          ]}
        >
          <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} size={size} />
        </View>
      ))}
      {rest > 0 ? (
        <View style={[styles.clusterItem, styles.more, { marginLeft: -overlap, width: size + 6, height: size + 6, borderRadius: size }]}>
          <Text style={[styles.moreText, { fontSize: Math.max(11, size * 0.3) }]} maxFontSizeMultiplier={1}>
            +{rest}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Gradient artwork panel for a bag: abstract motif + oversized logo cluster. */
export function BagArt({
  bag,
  height = 150,
  logoSize = 56,
  showThemeIcon = true,
  logosOnTop = false,
  style,
  children,
}: {
  bag: Bag;
  height?: number;
  logoSize?: number;
  showThemeIcon?: boolean;
  /** Logos sit at the top-left and `children` (e.g. a title overlay) at the bottom, over a soft scrim. */
  logosOnTop?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { theme } = useUnistyles();
  const { icon, gradient } = bagTheme(bag);
  const colors = theme.gradients[gradient];
  const [width, setWidth] = useState(0);
  return (
    <View
      style={[styles.art, { height }, style]}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {width > 0 ? <Motif seed={hash(bag.id)} width={width} height={height} /> : null}
      {showThemeIcon ? (
        <View style={styles.themeIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name={icon} size={16} color="#FFFFFF" />
        </View>
      ) : null}
      {logosOnTop ? (
        <LinearGradient
          colors={["rgba(16,19,31,0)", "rgba(16,19,31,0.28)"]}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <View style={logosOnTop ? styles.clusterTop : styles.clusterWrap}>
        <LogoCluster assets={bag.assets} size={logoSize} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { overflow: "hidden", justifyContent: "flex-end" },
  themeIcon: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  clusterWrap: { paddingHorizontal: 18, paddingBottom: 16 },
  clusterTop: { position: "absolute", top: 18, left: 18 },
  cluster: { flexDirection: "row", alignItems: "center" },
  clusterItem: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    shadowColor: "#10131F",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  more: { alignItems: "center", justifyContent: "center", backgroundColor: "#E9EDFF" },
  moreText: { color: "#3A5BFF", fontWeight: "800" },
});
