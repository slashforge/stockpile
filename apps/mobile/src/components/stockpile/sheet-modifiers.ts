import type { BottomSheetProps } from "@expo/ui";

/** Android's Material sheet is already opaque (surface container colour). */
export function sheetModifiers(_surface: string): BottomSheetProps["modifiers"] {
  return undefined;
}
