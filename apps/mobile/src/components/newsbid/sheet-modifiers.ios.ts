import { presentationBackground } from "@expo/ui/swift-ui/modifiers";

/**
 * iOS 26 gives SwiftUI sheets a translucent Liquid Glass background, so the screen behind bleeds
 * through the sheet's content. Paint the whole sheet chrome with an opaque surface instead.
 */
export function sheetModifiers(surface: string) {
  return [presentationBackground(surface)];
}
