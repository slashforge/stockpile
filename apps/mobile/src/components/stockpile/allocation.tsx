import { useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { resolveAssetColors } from "@/lib/asset-colors";
import type { BagAsset } from "@/services/api/types";
import { formatBps } from "@/utils/amounts";
import { TokenAvatar } from "./token-avatar";
import { T } from "./type";

/**
 * Colour per asset, in order: the token's `brandColor` (server-extracted from its icon) when set,
 * else the chart palette. Neighbours are kept distinguishable. Index into it with the asset index.
 */
export function useAssetColors(assets: readonly BagAsset[]): string[] {
  const { theme, rt } = useUnistyles();
  const dark = rt.themeName === "dark";
  const key = assets.map((asset) => asset.brandColor ?? "").join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the only input that matters.
  return useMemo(() => resolveAssetColors(assets, theme.chart, dark), [key, theme.chart, dark]);
}

export function AllocationBar({ assets, height = 6 }: { assets: BagAsset[]; height?: number }) {
  const colors = useAssetColors(assets);
  const total = assets.reduce((sum, asset) => sum + asset.weightBps, 0) || 1;
  return (
    <View
      style={[styles.bar, { height, borderRadius: height / 2 }]}
      accessibilityLabel={`Target weights: ${assets.map((a) => `${a.symbol} ${formatBps(a.weightBps)}`).join(", ")}`}
    >
      {assets.map((asset, index) => (
        <View key={`${asset.symbol}-${index}`} style={{ flex: asset.weightBps / total, backgroundColor: colors[index] }} />
      ))}
    </View>
  );
}

/** Compact constituent chips: symbol + weight with its allocation colour. */
export function ConstituentChips({ assets, limit = 4 }: { assets: BagAsset[]; limit?: number }) {
  const colors = useAssetColors(assets);
  const shown = assets.slice(0, limit);
  const rest = assets.length - shown.length;
  return (
    <View style={styles.chips}>
      {shown.map((asset, index) => (
        <View key={`${asset.symbol}-${index}`} style={styles.chip}>
          <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} size={22} ring={colors[index]} />
          <T variant="footnote" style={styles.symbol}>
            {asset.symbol}
          </T>
          <T variant="footnote" tone="secondary" style={styles.tabular}>
            {formatBps(asset.weightBps)}
          </T>
        </View>
      ))}
      {rest > 0 ? (
        <View style={styles.chip}>
          <T variant="footnote" tone="secondary">
            +{rest}
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: "row",
    overflow: "hidden",
    gap: 2,
    backgroundColor: theme.ds.sunken,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6 },
  symbol: { fontWeight: "600" },
  tabular: { fontVariant: ["tabular-nums"] },
}));
