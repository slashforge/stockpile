import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { lightImpact, successNotification } from "@/components/utils/haptics";
import { T } from "./type";

const TRACK_HEIGHT = 58;
const KNOB_INSET = 4;
const KNOB_SIZE = TRACK_HEIGHT - KNOB_INSET * 2;
/** Fraction of the travel distance the knob must pass before the action fires. */
const COMMIT_AT = 0.88;

type Props = {
  label: string;
  /** Called once when the knob is released past the threshold. */
  onConfirm: () => void;
  tone?: "accent" | "danger";
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  disabled?: boolean;
  loading?: boolean;
  /** Bumping this snaps the knob back to the start (e.g. after a rejected confirm). */
  resetKey?: unknown;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/**
 * Drag-to-confirm control for irreversible actions. The knob has to travel
 * almost the full track before the action fires, so an accidental tap or a
 * short flick does nothing.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  tone = "accent",
  icon = "chevron-forward",
  disabled,
  loading,
  resetKey,
  style,
  accessibilityHint,
}: Props) {
  const { theme } = useUnistyles();
  styles.useVariants({ tone });
  const [trackWidth, setTrackWidth] = useState(0);
  const travel = Math.max(trackWidth - KNOB_SIZE - KNOB_INSET * 2, 1);
  const x = useSharedValue(0);
  const dragging = useSharedValue(false);
  const inactive = disabled || loading;

  useEffect(() => {
    x.value = withSpring(0, { damping: 18, stiffness: 180 });
  }, [resetKey, x]);

  const confirm = () => {
    successNotification();
    onConfirm();
  };

  const pan = Gesture.Pan()
    .enabled(!inactive)
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      dragging.value = true;
      runOnJS(lightImpact)();
    })
    .onUpdate((event) => {
      x.value = Math.min(Math.max(event.translationX, 0), travel);
    })
    .onEnd(() => {
      if (x.value >= travel * COMMIT_AT) {
        x.value = withTiming(travel, { duration: 120 });
        runOnJS(confirm)();
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale: dragging.value ? 1.04 : 1 }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + KNOB_SIZE + KNOB_INSET * 2,
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, travel * 0.55], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(x.value, [0, travel], [0, 24], Extrapolation.CLAMP) }],
  }));

  const knobFg = tone === "danger" ? theme.ds.danger : theme.ds.accent;

  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? "Swipe right to confirm"}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onLayout={onLayout}
      style={[styles.track, inactive && !loading && styles.muted, style]}
    >
      {!inactive ? <Animated.View style={[styles.fill, fillStyle]} /> : null}
      <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
        {loading ? (
          <ActivityIndicator color={theme.ds.onAccent} />
        ) : (
          <T variant="headline" style={[styles.label, inactive && styles.mutedLabel]}>
            {label}
          </T>
        )}
      </Animated.View>
      {!loading ? (
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.knob, inactive && styles.mutedKnob, knobStyle]}>
            <Ionicons name={icon} size={22} color={inactive ? theme.ds.inkTertiary : knobFg} />
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: theme.radius.full,
    justifyContent: "center",
    overflow: "hidden",
    variants: {
      tone: {
        accent: {
          backgroundColor: theme.ds.accent,
          shadowColor: theme.ds.accent,
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        },
        danger: {
          backgroundColor: theme.ds.danger,
          shadowColor: theme.ds.danger,
          shadowOpacity: 0.24,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        },
      },
    },
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  labelWrap: {
    position: "absolute",
    left: KNOB_SIZE + KNOB_INSET * 2,
    right: KNOB_SIZE + KNOB_INSET * 2,
    alignItems: "center",
  },
  label: { fontWeight: "600", color: theme.ds.onAccent },
  knob: {
    position: "absolute",
    left: KNOB_INSET,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: theme.ds.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  muted: { backgroundColor: theme.ds.sunken, shadowOpacity: 0, elevation: 0 },
  mutedLabel: { color: theme.ds.inkTertiary },
  mutedKnob: { backgroundColor: theme.ds.surface, shadowOpacity: 0, elevation: 0 },
}));
