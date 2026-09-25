import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { T } from "@/components/stockpile/type";
import type { ImpactLevel } from "@/lib/trade/legs";
import { formatBps } from "@/utils/amounts";

export const SLIPPAGE_OPTIONS = [
  { bps: 50, label: "0.5%" },
  { bps: 100, label: "1%" },
  { bps: 300, label: "3%" },
];

export function Chip({
  label,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  chipStyles.useVariants({ selected, compact });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={compact ? 6 : undefined}
      style={({ pressed }) => [chipStyles.chip, pressed && chipStyles.pressed]}
    >
      <T variant={compact ? "footnote" : "subhead"} style={chipStyles.label}>
        {label}
      </T>
    </Pressable>
  );
}

/** Slippage is a setting, not a step: a small toggle that reveals the options. */
export function SlippageControl({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (bps: number) => void;
  disabled?: boolean;
}) {
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.slippage}>
      {open ? (
        <View style={styles.slippagePanel}>
          {SLIPPAGE_OPTIONS.map((option) => (
            <Chip
              key={option.bps}
              compact
              label={option.label}
              selected={value === option.bps}
              onPress={() => {
                onChange(option.bps);
                setOpen(false);
              }}
            />
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Slippage ${formatBps(value)}`}
        accessibilityHint="Shows slippage options"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.slippageToggle, pressed && chipStyles.pressed]}
      >
        <Ionicons name="options-outline" size={15} color={theme.ds.inkSecondary} />
        <T variant="footnote" tone="secondary" style={styles.bold}>
          Slippage {formatBps(value)}
        </T>
      </Pressable>
    </View>
  );
}

// Fixed steps instead of `adjustsFontSizeToFit`: inside a height-constrained flex column iOS
// shrinks auto-fit text far below `minimumFontScale`, leaving a dot where the amount should be.
export function heroSize(text: string) {
  if (text.length <= 6) return { fontSize: 72, lineHeight: 84, letterSpacing: -2.5 };
  if (text.length <= 9) return { fontSize: 56, lineHeight: 68, letterSpacing: -2 };
  return { fontSize: 42, lineHeight: 52, letterSpacing: -1.2 };
}

/** Compact price-impact warning; renders nothing for healthy routes. */
export function ImpactLabel({ level, impact }: { level: ImpactLevel; impact: number | null }) {
  const { theme } = useUnistyles();
  if (impact == null || (level !== "warn" && level !== "high")) return null;
  const color = level === "high" ? theme.ds.danger : theme.ds.caution;
  return (
    <View
      style={styles.impact}
      accessibilityLabel={`${level === "high" ? "Very high" : "High"} price impact, ${impact.toFixed(2)} percent. Thin liquidity.`}
    >
      <Ionicons name="warning" size={11} color={color} />
      <T variant="caption" style={[styles.bold, { color }]}>
        {impact.toFixed(2)}% impact
      </T>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bold: { fontWeight: "600" },
  slippage: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  slippageToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.ds.sunken,
  },
  slippagePanel: { flexDirection: "row", gap: 6 },
  impact: { flexDirection: "row", alignItems: "center", gap: 3 },
}));

const chipStyles = StyleSheet.create((theme) => ({
  chip: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    borderWidth: 1,
    variants: {
      selected: {
        true: { backgroundColor: theme.ds.accent, borderColor: theme.ds.accent },
        false: { backgroundColor: theme.ds.surface, borderColor: theme.ds.lineStrong },
      },
      compact: {
        true: { minHeight: 32, minWidth: 52, paddingHorizontal: 12 },
        false: {},
      },
    },
  },
  pressed: { opacity: 0.75 },
  label: {
    fontWeight: "600",
    variants: {
      selected: {
        true: { color: theme.ds.onAccent },
        false: { color: theme.ds.ink },
      },
    },
  },
}));
