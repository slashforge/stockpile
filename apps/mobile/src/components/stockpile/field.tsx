import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { View, type KeyboardTypeOptions, type ReturnKeyTypeOptions } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SheetTextInput } from "./sheet-text-input";
import { T } from "./type";

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  error?: string | null;
  size?: "md" | "xl";
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  autoComplete?: "email" | "one-time-code";
  editable?: boolean;
  maxLength?: number;
  onSubmitEditing?: () => void;
};

/**
 * Labelled text field with focus and error states. Text entry is an Expo UI native field so it
 * works inside the Expo UI bottom sheets on both platforms.
 */
export function Field({ label, icon, error, size = "md", ...input }: Props) {
  const { theme } = useUnistyles();
  const [focused, setFocused] = useState(false);
  styles.useVariants({ size, state: error ? "error" : focused ? "focused" : "idle" });
  return (
    <View style={styles.wrap} accessible={false}>
      <T variant="subhead" tone="secondary">
        {label}
      </T>
      <View style={styles.box} accessibilityLabel={label}>
        {icon ? <Ionicons name={icon} size={18} color={focused ? theme.ds.accent : theme.ds.inkTertiary} /> : null}
        <SheetTextInput
          {...input}
          size={size}
          align={size === "xl" ? "center" : "left"}
          testID={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {error ? (
        <T variant="footnote" tone="danger" accessibilityRole="alert">
          {error}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { gap: 8 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    ...theme.rounded(16),
    backgroundColor: theme.ds.surface,
    borderWidth: 1.5,
    variants: {
      size: {
        md: { minHeight: 54 },
        xl: { minHeight: 68 },
      },
      state: {
        idle: { borderColor: theme.ds.line },
        focused: { borderColor: theme.ds.accent },
        error: { borderColor: theme.ds.danger },
      },
    },
  },
}));
