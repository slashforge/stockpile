import { Host, TextInput as NativeTextInput, type TextInputRef, useNativeState } from "@expo/ui";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { KeyboardTypeOptions, ReturnKeyTypeOptions } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type SheetTextInputHandle = { focus: () => void; blur: () => void };

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  autoComplete?: "email" | "one-time-code";
  editable?: boolean;
  maxLength?: number;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  size?: "md" | "xl";
  align?: "left" | "center";
  testID?: string;
};

/**
 * Text entry rendered by Expo UI (SwiftUI TextField / Compose BasicTextField). Used inside the
 * Expo UI native sheets, where a React Native TextInput cannot take keyboard focus on Android
 * (the Material sheet runs in its own dialog window). Controlled from React via `value`.
 */
export const SheetTextInput = forwardRef<SheetTextInputHandle, Props>(function SheetTextInput(
  {
    value,
    onChangeText,
    placeholder,
    keyboardType,
    returnKeyType,
    autoCapitalize,
    autoCorrect,
    autoComplete,
    editable = true,
    maxLength,
    onSubmitEditing,
    onFocus,
    onBlur,
    size = "md",
    align = "left",
    testID,
  },
  ref,
) {
  const { theme } = useUnistyles();
  const state = useNativeState(value);
  const inner = useRef<TextInputRef>(null);

  // Push external changes (presets, "Max", resets) into the native field.
  useEffect(() => {
    if (state.value !== value) state.value = value;
  }, [state, value]);

  useImperativeHandle(ref, () => ({
    focus: () => inner.current?.focus(),
    blur: () => inner.current?.blur(),
  }));

  const fontSize = size === "xl" ? 30 : 17;
  return (
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <NativeTextInput
        ref={inner}
        value={state}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.ds.inkTertiary}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoComplete={autoComplete}
        editable={editable}
        maxLength={maxLength}
        onSubmitEditing={onSubmitEditing ? () => onSubmitEditing() : undefined}
        onFocus={onFocus}
        onBlur={onBlur}
        cursorColor={theme.ds.accent}
        selectionColor={theme.ds.accent}
        textAlign={align}
        testID={testID}
        textStyle={{
          fontSize,
          fontWeight: size === "xl" ? "700" : "400",
          color: theme.ds.ink,
        }}
      />
    </Host>
  );
});

const styles = StyleSheet.create({
  host: { flex: 1 },
});
