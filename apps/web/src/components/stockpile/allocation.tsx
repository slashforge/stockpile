import { useMemo } from "react";
import { chartPalette, useIsDark } from "@/components/ui/theme";
import { resolveAssetColors } from "@/lib/asset-colors";
import type { BagAsset } from "@/services/api/types";
import { formatBps } from "@/utils/amounts";

/** Colour per asset, in order: the token's brand colour when set, else the chart palette. */
export function useAssetColors(assets: readonly Pick<BagAsset, "brandColor">[]): string[] {
  const dark = useIsDark();
  const key = assets.map((asset) => asset.brandColor ?? "").join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the only input that matters.
  return useMemo(() => resolveAssetColors(assets, dark ? chartPalette.dark : chartPalette.light, dark), [key, dark]);
}

export function AllocationBar({ assets, height = 6 }: { assets: BagAsset[]; height?: number }) {
  const colors = useAssetColors(assets);
  const total = assets.reduce((sum, asset) => sum + asset.weightBps, 0) || 1;
  return (
    <div
      className="flex gap-0.5 overflow-hidden bg-sunken"
      style={{ height, borderRadius: height / 2 }}
      role="img"
      aria-label={`Target weights: ${assets.map((a) => `${a.symbol} ${formatBps(a.weightBps)}`).join(", ")}`}
    >
      {assets.map((asset, index) => (
        <div key={`${asset.symbol}-${index}`} style={{ flex: asset.weightBps / total, backgroundColor: colors[index] }} />
      ))}
    </div>
  );
}
