import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { lightImpact } from "@/components/utils/haptics";
import { T } from "./type";

type Props = {
  label: string;
  onPress: () => void;
  /** solid = primary action, outline = secondary, ghost = low emphasis text action. */
  variant?: "solid" | "outline" | "ghost" | "light";
  size?: "lg" | "md";
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function PrimaryButton({
  label,
  onPress,
  variant = "solid",
  size = "lg",
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: Props) {
  const { theme } = useUnistyles();
  styles.useVariants({ variant, size });
  const inactive = disabled || loading;
  // Disabled solid buttons read as "not available" rather than a faded primary action.
  const mutedSolid = variant === "solid" && disabled && !loading;
  const fg = mutedSolid
    ? theme.ds.inkTertiary
    : variant === "solid"
      ? theme.ds.onAccent
      : variant === "ghost" || variant === "light"
        ? theme.ds.accent
        : theme.ds.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        lightImpact();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        mutedSolid ? styles.mutedSolid : inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={size === "lg" ? 18 : 16} color={fg} /> : null}
          <T variant={size === "lg" ? "headline" : "subhead"} style={[styles.label, { color: fg }]}>
            {label}
          </T>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    variants: {
      size: {
        lg: { minHeight: 54, paddingHorizontal: theme.spacing.lg },
        md: { minHeight: 44, paddingHorizontal: theme.spacing.md },
      },
      variant: {
        solid: {
          backgroundColor: theme.ds.accent,
          shadowColor: theme.ds.accent,
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        },
        outline: {
          backgroundColor: theme.ds.surface,
          borderWidth: 1,
          borderColor: theme.ds.lineStrong,
        },
        ghost: {},
        light: { backgroundColor: "#FFFFFF" },
      },
    },
  },
  content: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontWeight: "600" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  mutedSolid: { backgroundColor: theme.ds.sunken, shadowOpacity: 0, elevation: 0 },
}));
