import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { T } from "@/components/stockpile/type";
import {
  lightImpact,
  mediumImpact,
  selection,
} from "@/components/utils/haptics";

export type NumpadKey =
  "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | ".";

type NumpadProps = {
  onPress: (value: NumpadKey) => void;
  onBackspace?: () => void;
  /** Long-press on backspace. */
  onClear?: () => void;
  disabled?: boolean;
};

const ROWS: (NumpadKey | "delete")[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "delete"],
];

/** In-app decimal keypad, so amount entry never raises the OS keyboard. */
export default function Numpad({
  onPress,
  onBackspace,
  onClear,
  disabled,
}: NumpadProps) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.grid} testID="numpad">
      {ROWS.map((row) => (
        <View key={row.join("")} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={
                key === "delete"
                  ? "Delete"
                  : key === "."
                    ? "Decimal point"
                    : key
              }
              accessibilityHint={
                key === "delete" && onClear ? "Long press to clear" : undefined
              }
              disabled={disabled}
              onPress={() => {
                if (key === "delete") {
                  lightImpact();
                  onBackspace?.();
                } else {
                  selection();
                  onPress(key);
                }
              }}
              onLongPress={
                key === "delete" && onClear
                  ? () => {
                      mediumImpact();
                      onClear();
                    }
                  : undefined
              }
              style={({ pressed }) => [
                styles.key,
                pressed && styles.keyPressed,
                disabled && styles.disabled,
              ]}
            >
              {key === "delete" ? (
                <Ionicons
                  name="backspace-outline"
                  size={26}
                  color={theme.ds.ink}
                />
              ) : (
                <T variant="title1" style={styles.digit}>
                  {key}
                </T>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: { gap: 4 },
  row: { flexDirection: "row", gap: 4 },
  key: {
    flex: 1,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    ...theme.rounded(18),
  },
  keyPressed: { backgroundColor: theme.ds.sunken },
  disabled: { opacity: 0.4 },
  digit: { fontWeight: "600", letterSpacing: 0 },
}));
