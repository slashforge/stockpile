import { forwardRef } from "react";
import { Pressable, type PressableProps, type View } from "react-native";
import { type HapticFeedbackType, triggerHaptic } from "@/components/utils/haptics";

export type HapticPressableProps = PressableProps & {
  /** Feedback fired on press (and long press). Defaults to a selection tick. */
  haptic?: HapticFeedbackType;
};

/** Drop-in `Pressable` that plays a haptic when an enabled press lands. */
export const HapticPressable = forwardRef<View, HapticPressableProps>(function HapticPressable(
  { haptic = "selection", onPress, onLongPress, disabled, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      onPress={
        onPress
          ? (event) => {
              triggerHaptic(haptic, !!disabled);
              onPress(event);
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? (event) => {
              triggerHaptic("medium", !!disabled);
              onLongPress(event);
            }
          : undefined
      }
      {...rest}
    />
  );
});
