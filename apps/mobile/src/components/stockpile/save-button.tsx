import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { selection } from "@/components/utils/haptics";
import { useSavedBagIds, useToggleSaved } from "@/hooks/use-account";
import { useSonner } from "@/hooks/use-sonner";
import { useStockpileAuth } from "@/providers/auth-context";
import { useSignInSheet } from "./sign-in-sheet";

/** Bookmark toggle. Signed-out users are sent to sign in; browse-only builds hide it. */
export function SaveButton({
  bagId,
  title,
  variant = "plain",
}: {
  bagId: string;
  title: string;
  variant?: "plain" | "circle" | "glass";
}) {
  const { theme } = useUnistyles();
  const { configured, authenticated } = useStockpileAuth();
  const saved = useSavedBagIds();
  const toggle = useToggleSaved();
  const sonner = useSonner();
  const { requestSignIn } = useSignInSheet();

  if (!configured) return null;

  const isSaved = !!saved.data?.includes(bagId);

  const onPress = () => {
    if (!authenticated) {
      requestSignIn();
      return;
    }
    selection();
    toggle.mutate(
      { bagId, saved: isSaved },
      {
        onSuccess: () => sonner.success(isSaved ? "Removed" : "Saved"),
        onError: () => sonner.error(isSaved ? "Not removed" : "Not saved"),
      },
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isSaved ? `Remove ${title} from saved` : `Save ${title}`}
      accessibilityState={{ selected: isSaved }}
      hitSlop={8}
      onPress={onPress}
      disabled={toggle.isPending}
      style={({ pressed }) => [
        styles.button,
        variant === "circle" && styles.circle,
        variant === "glass" && styles.glass,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={isSaved ? "bookmark" : "bookmark-outline"}
        size={20}
        color={variant === "glass" ? "#FFFFFF" : isSaved ? theme.ds.accent : theme.ds.inkSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    backgroundColor: theme.ds.surface,
    shadowColor: "#1B2250",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  glass: { backgroundColor: "rgba(255,255,255,0.24)" },
  pressed: { opacity: 0.6 },
}));
