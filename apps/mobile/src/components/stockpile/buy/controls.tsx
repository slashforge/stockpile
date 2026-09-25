import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { T } from "@/components/stockpile/type";
import type { ImpactLevel } from "@/lib/trade/legs";
import { formatBps } from "@/utils/amounts";

/** `null` = automatic: Jupiter picks the limit per swap from live market conditions. */
export const SLIPPAGE_OPTIONS: { bps: number | null; label: string }[] = [
  { bps: null, label: "Auto" },
  { bps: 50, label: "0.5%" },
  { bps: 100, label: "1%" },
  { bps: 300, label: "3%" },
];

/** Short label for the price-protection setting: "Auto" or a fixed percentage. */
export function protectionLabel(bps: number | null) {
  return bps == null ? "Auto" : formatBps(bps);
}

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

/** Header cog for the trade settings (price protection today); a dot marks a non-default setting. */
export function TradeSettingsButton({
  value,
  open,
  onPress,
}: {
  value: number | null;
  open: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Trade settings. Price protection ${protectionLabel(value)}`}
      accessibilityState={{ expanded: open }}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed && chipStyles.pressed]}
    >
      <Ionicons name="settings-outline" size={19} color={theme.ds.inkSecondary} />
      {value != null ? <View style={styles.customDot} /> : null}
    </Pressable>
  );
}

/**
 * Popover for the header cog. Rendered by the flow layout as an overlay of the whole sheet (so its
 * chips stay tappable), with the card placed just under the header at `top`.
 */
export function TradeSettingsPopover({
  open,
  top,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  top: number;
  value: number | null;
  onChange: (bps: number | null) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close settings" />
      <View style={[styles.popover, { top }]} accessibilityViewIsModal>
        <T variant="subhead" style={styles.bold}>
          Price protection
        </T>
        <T variant="footnote" tone="secondary">
          The most the price can move on each swap before it’s cancelled. Auto adapts to the market.
        </T>
        <View style={styles.popoverChips}>
          {SLIPPAGE_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              compact
              label={option.label}
              selected={value === option.bps}
              onPress={() => {
                onChange(option.bps);
                onClose();
              }}
            />
          ))}
        </View>
      </View>
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
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.sunken,
  },
  customDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.ds.accent,
  },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  popover: {
    position: "absolute",
    right: theme.density.gutter,
    width: 280,
    gap: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.ds.surface,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  popoverChips: { flexDirection: "row", gap: 6, marginTop: 4 },
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
