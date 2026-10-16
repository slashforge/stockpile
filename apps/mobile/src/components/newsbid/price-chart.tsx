import { memo, useCallback, useMemo, useRef } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { LineChart } from "react-native-wagmi-charts";
import { selection } from "@/components/utils/haptics";
import { changeTone } from "@/lib/market";
import {
  CHART_RANGES,
  type ChartPoint,
  type ChartRange,
  isDrawable,
} from "@/services/api/charts";
import { T } from "./type";

/** Green / red by direction; brand blue when flat or unknown. */
export function useChartColor(changePct: number | null | undefined) {
  const { theme } = useUnistyles();
  const tone = changeTone(changePct);
  if (tone === "up") return theme.ds.positive;
  if (tone === "down") return theme.ds.danger;
  return theme.ds.accent;
}

const DATETIME_OPTIONS: Record<ChartRange, Intl.DateTimeFormatOptions> = {
  "1D": { hour: "numeric", minute: "2-digit" },
  "1W": { weekday: "short", hour: "numeric" },
  "1M": { month: "short", day: "numeric" },
  "1Y": { month: "short", day: "numeric", year: "numeric" },
  ALL: { month: "short", day: "numeric", year: "numeric" },
};

/**
 * Edge-to-edge line chart with gradient fill, crosshair and a date tooltip. Renders nothing for
 * fewer than two points so a missing series never shows as a flat line or an empty box.
 * `onScrub` receives the point under the finger, then `null` on release.
 */
export const PriceChart = memo(function PriceChart({
  points,
  color,
  range,
  height = 220,
  bleed = 0,
  onScrub,
  accessibilityLabel,
}: {
  points: ChartPoint[] | undefined;
  color: string;
  range: ChartRange;
  height?: number;
  /** Horizontal padding of the parent to break out of, for edge-to-edge charts. */
  bleed?: number;
  onScrub?: (point: ChartPoint | null) => void;
  accessibilityLabel?: string;
}) {
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const previous = useRef(-1);

  const handleIndex = useCallback(
    (index: number) => {
      if (index === -1) {
        previous.current = -1;
        onScrub?.(null);
        return;
      }
      if (index === previous.current) return;
      if (previous.current !== -1) selection();
      previous.current = index;
      const point = points?.[index];
      if (point) onScrub?.(point);
    },
    [onScrub, points],
  );

  const data = useMemo(() => points ?? [], [points]);
  if (!isDrawable(points)) return null;

  return (
    <View
      style={[styles.wrap, { marginHorizontal: -bleed, height }]}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <LineChart.Provider data={data} onCurrentIndexChange={handleIndex}>
        <LineChart height={height} width={width} yGutter={20}>
          <LineChart.Path color={color} width={2.5}>
            <LineChart.Gradient color={color} />
          </LineChart.Path>
          <LineChart.CursorCrosshair
            color={color}
            crosshairOuterProps={{ style: { backgroundColor: `${color}33` } }}
          >
            <LineChart.Tooltip position="top" yGutter={-4}>
              <LineChart.DatetimeText
                locale="en-US"
                options={DATETIME_OPTIONS[range]}
                style={[styles.tooltip, { color: theme.ds.inkSecondary }]}
              />
            </LineChart.Tooltip>
          </LineChart.CursorCrosshair>
        </LineChart>
      </LineChart.Provider>
    </View>
  );
});

/** 1D / 1W / 1M / ALL selector shown under a chart. */
export function RangeChips({
  value,
  onChange,
  color,
  busy,
}: {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
  color: string;
  busy?: boolean;
}) {
  return (
    <View style={styles.chips} accessibilityRole="tablist">
      {CHART_RANGES.map((range) => {
        const active = range === value;
        return (
          <Pressable
            key={range}
            accessibilityRole="tab"
            accessibilityLabel={`Range ${range}`}
            accessibilityState={{ selected: active, busy: active && busy }}
            hitSlop={4}
            onPress={() => {
              if (active) return;
              selection();
              onChange(range);
            }}
            style={({ pressed }) => [
              styles.chip,
              active && { backgroundColor: `${color}1A` },
              pressed && styles.pressed,
            ]}
          >
            <T
              variant="subhead"
              style={[styles.chipLabel, active ? { color } : styles.chipIdle]}
            >
              {range}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { overflow: "hidden" },
  tooltip: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chips: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: theme.density.item,
  },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: theme.radius.full,
  },
  chipLabel: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  chipIdle: { color: theme.ds.inkTertiary },
  pressed: { opacity: 0.6 },
}));
