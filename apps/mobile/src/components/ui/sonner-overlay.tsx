import React from "react";
import { Platform, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { useSonner } from "@/providers/sonner-provider";
import { SonnerItem } from "./sonner-item";
import { StyleSheet } from "react-native-unistyles";

const TopWindowOverlay = ({ children }: React.PropsWithChildren) => {
  if (Platform.OS !== "ios") {
    return <>{children}</>;
  }

  return <FullWindowOverlay>{children}</FullWindowOverlay>;
};

export const SonnerOverlay: React.FC = () => {
  const { sonners, hideSonner } = useSonner();

  if (sonners.length === 0) {
    return null;
  }

  return (
    <TopWindowOverlay>
      <View style={styles.overlay} pointerEvents="box-none">
        {sonners.map((sonner, index) => (
          <SonnerItem
            key={sonner.id}
            sonner={sonner}
            onRemove={hideSonner}
            index={index}
          />
        ))}
      </View>
    </TopWindowOverlay>
  );
};

const styles = StyleSheet.create(() => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    pointerEvents: "box-none",
  },
}));
