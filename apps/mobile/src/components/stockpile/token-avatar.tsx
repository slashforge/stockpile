import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { safeIconUrl, tickerInitials } from "@/utils/token-icon";
import { KnownTokenLogo, knownToken } from "./token-logos";
import { T } from "./type";

type Props = {
  symbol: string;
  iconUrl?: string | null;
  /** Lets SOL / USDC resolve to the bundled marks even when the symbol is unexpected. */
  mint?: string | null;
  size?: number;
  /** Ring colour, e.g. the asset's allocation colour. */
  ring?: string;
};

/**
 * Token logo: bundled marks for SOL / USDC, otherwise a cached remote image (memory + disk via
 * expo-image) with a ticker monogram fallback when the URL is missing, not HTTPS, or fails to load.
 * Decorative: callers render the symbol as text for accessibility.
 */
export function TokenAvatar({ symbol, iconUrl, mint, size = 36, ring }: Props) {
  const { theme } = useUnistyles();
  const known = knownToken(symbol, mint);
  const url = safeIconUrl(iconUrl);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!url && failedUrl !== url;
  const radius = size / 2;

  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: radius },
        ring ? { borderColor: ring, borderWidth: 1.5 } : null,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {known ? (
        <KnownTokenLogo token={known} size={size} />
      ) : showImage ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={url}
          transition={120}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <View style={[styles.monogram, { width: size, height: size, borderRadius: radius }]}>
          <T
            variant="caption"
            style={[styles.initials, { fontSize: Math.max(10, size * 0.34), lineHeight: Math.max(12, size * 0.4) }]}
            maxFontSizeMultiplier={1}
          >
            {tickerInitials(symbol)}
          </T>
        </View>
      )}
      <View style={[styles.hairline, { borderRadius: radius, borderColor: theme.ds.line }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  frame: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.surface,
  },
  monogram: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accentSoft,
  },
  initials: { color: theme.ds.accent, fontWeight: "700", letterSpacing: 0.3 },
  hairline: { ...StyleSheet.absoluteFillObject, borderWidth: StyleSheet.hairlineWidth },
}));
