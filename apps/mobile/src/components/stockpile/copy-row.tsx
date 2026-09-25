import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSonner } from "@/hooks/use-sonner";
import { shortAddress } from "@/utils/amounts";
import { T } from "./type";

export function CopyRow({ label, value }: { label: string; value: string }) {
  const { theme } = useUnistyles();
  const sonner = useSonner();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        sonner.success("Copied");
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <T variant="footnote" tone="secondary">
          {label}
        </T>
        <T variant="numeric">{shortAddress(value, 6)}</T>
      </View>
      <View style={styles.copy}>
        <Ionicons name="copy-outline" size={16} color={theme.ds.accent} />
        <T variant="footnote" tone="accent" style={styles.copyText}>
          Copy
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: { gap: 2, flex: 1 },
  copy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.ds.accentSoft,
  },
  copyText: { fontWeight: "600" },
  pressed: { backgroundColor: theme.ds.scrim },
}));
