import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, View, type KeyboardTypeOptions, type ReturnKeyTypeOptions } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { errorNotification } from "@/components/utils/haptics";
import { SheetTextInput, type SheetTextInputHandle } from "./sheet-text-input";
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
  const inputRef = useRef<SheetTextInputHandle>(null);
  styles.useVariants({ size, state: error ? "error" : focused ? "focused" : "idle" });
  useEffect(() => {
    if (error) errorNotification();
  }, [error]);
  return (
    <View style={styles.wrap} accessible={false}>
      <T variant="subhead" tone="secondary">
        {label}
      </T>
      {/* The native field only fills its text line; a tap anywhere in the bordered box focuses it. */}
      <Pressable
        style={styles.box}
        accessibilityLabel={label}
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        disabled={input.editable === false}
      >
        {icon ? <Ionicons name={icon} size={18} color={focused ? theme.ds.accent : theme.ds.inkTertiary} /> : null}
        <SheetTextInput
          ref={inputRef}
          {...input}
          size={size}
          align={size === "xl" ? "center" : "left"}
          testID={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </Pressable>
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
    paddingHorizontal: 14,
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
