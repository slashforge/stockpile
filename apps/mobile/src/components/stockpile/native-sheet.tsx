import { BottomSheet, RNHostView, type SnapPoint } from "@expo/ui";
import { Dimensions, Platform, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { lightImpact } from "@/components/utils/haptics";
import { FitSheet } from "./fit-sheet";
import { sheetModifiers } from "./sheet-modifiers";

// Material 3 drag handle: 4dp bar with 22dp vertical padding.
const ANDROID_DRAG_HANDLE = 48;

/**
 * Expo UI universal BottomSheet (SwiftUI sheet on iOS, Material 3 ModalBottomSheet on Android)
 * hosting React Native content. `fit` sizes to content; otherwise the sheet opens as a full-height
 * page and the child should scroll.
 */
export function NativeSheet({
  isPresented,
  onDismiss,
  fit = false,
  snapPoints,
  children,
  testID,
}: {
  isPresented: boolean;
  onDismiss: () => void;
  fit?: boolean;
  snapPoints?: SnapPoint[];
  children: React.ReactNode;
  testID?: string;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  // Still presented when the callback fires = the user swiped/tapped it away (not a programmatic close).
  const handleDismiss = () => {
    if (isPresented) lightImpact();
    onDismiss();
  };
  // The universal sheet pads its content by 16pt on each side.
  const contentWidth = width - 32;

  // Android full height: an unsized RNHostView inside the M3 sheet crashed on dismiss, so keep the
  // content-measured host but give it an explicit page height. `full` makes the sheet skip the
  // half-expanded state; M3 already insets its content from the status and navigation bars.
  const androidPage = Platform.OS === "android" && !fit;
  const pageHeight = Dimensions.get("screen").height - insets.top - insets.bottom - ANDROID_DRAG_HANDLE;

  if (fit && Platform.OS === "android") {
    return (
      <FitSheet isPresented={isPresented} onDismiss={handleDismiss} testID={testID}>
        <RNHostView matchContents>
          <View style={{ width: contentWidth }}>{children}</View>
        </RNHostView>
      </FitSheet>
    );
  }

  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={handleDismiss}
      snapPoints={fit ? undefined : (snapPoints ?? ["full"])}
      testID={testID}
      modifiers={sheetModifiers(theme.ds.surface)}
    >
      {fit || androidPage ? (
        <RNHostView matchContents>
          <View style={[{ width: contentWidth }, androidPage && { height: pageHeight }]}>
            {children}
          </View>
        </RNHostView>
      ) : (
        <RNHostView>
          <View style={styles.fill}>{children}</View>
        </RNHostView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
