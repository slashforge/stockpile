import { Column, Host, ModalBottomSheet, type ModalBottomSheetRef } from "@expo/ui/jetpack-compose";
import { padding, testID as testIDModifier } from "@expo/ui/jetpack-compose/modifiers";
import { useEffect, useRef, useState } from "react";
import { density } from "@/config/sizing";

/**
 * Content-sized Material 3 sheet. The universal BottomSheet leaves `skipPartiallyExpanded` off when
 * no snap points are given, so content taller than half the screen stopped half-open; skipping the
 * partial state makes the sheet open straight to its content height.
 */
export function FitSheet({
  isPresented,
  onDismiss,
  testID,
  children,
}: {
  isPresented: boolean;
  onDismiss: () => void;
  testID?: string;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const [mount, setMount] = useState(isPresented);
  if (isPresented && !mount) setMount(true);

  useEffect(() => {
    if (isPresented) return;
    let cancelled = false;
    sheetRef.current?.hide().then(() => {
      if (!cancelled) setMount(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isPresented]);

  if (!mount) return null;

  const modifiers = [padding(16, 0, 16, density.sheetBottom)];
  if (testID) modifiers.push(testIDModifier(testID));

  return (
    <Host style={{ position: "absolute" }} pointerEvents="none">
      <ModalBottomSheet ref={sheetRef} onDismissRequest={onDismiss} skipPartiallyExpanded>
        <Column modifiers={modifiers}>{children}</Column>
      </ModalBottomSheet>
    </Host>
  );
}
