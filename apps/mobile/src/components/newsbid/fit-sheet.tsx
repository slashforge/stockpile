/** Android-only (see fit-sheet.android.tsx); iOS uses the universal sheet's fitToContents. */
export function FitSheet(_props: {
  isPresented: boolean;
  onDismiss: () => void;
  testID?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return null;
}
