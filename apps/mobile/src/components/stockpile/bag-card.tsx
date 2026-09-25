import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { isPreIpoBag } from "@/lib/pre-ipo";
import type { Bag } from "@/services/api/types";
import { BagArt } from "./bag-art";
import { SaveButton } from "./save-button";
import { T } from "./type";
import { rounded } from "@/config/sizing";

/** Open to buy only when the server says so AND every asset has a verified mint. */
export function bagTradable(bag: Bag) {
  return (
    bag.tradable &&
    bag.assets.length > 0 &&
    bag.assets.every((asset) => !!asset.mint)
  );
}

/** Compact tradability chip. Never implies verification from branding. */
/** Small "Pre-IPO" marker for bags holding PreStocks tokens. */
export function PreIpoChip({ onArt = false }: { onArt?: boolean }) {
  const { theme } = useUnistyles();
  preIpoStyles.useVariants({ onArt });
  return (
    <View style={preIpoStyles.chip} accessibilityLabel="Pre-IPO">
      <Ionicons name="hourglass-outline" size={11} color={onArt ? "#FFFFFF" : theme.ds.lilac} />
      <T variant="caption" style={preIpoStyles.label}>
        Pre-IPO
      </T>
    </View>
  );
}

export function TradeStatus({
  bag,
  onArt = false,
}: {
  bag: Bag;
  onArt?: boolean;
}) {
  const { theme } = useUnistyles();
  const tradable = bagTradable(bag);
  statusStyles.useVariants({ tradable, onArt });
  return (
    <View style={statusStyles.row}>
      <View style={statusStyles.chip}>
        <Ionicons
          name={tradable ? "flash" : "book-outline"}
          size={12}
          color={
            onArt
              ? "#FFFFFF"
              : tradable
                ? theme.ds.positive
                : theme.ds.inkSecondary
          }
        />
        <T variant="caption" style={statusStyles.label}>
          {tradable ? "Open to buy" : "Research only"}
        </T>
      </View>
      {isPreIpoBag(bag) ? <PreIpoChip onArt={onArt} /> : null}
    </View>
  );
}

/** Full-bleed bag tile: gradient artwork with real token logos, title and status overlaid. */
export function BagCard({
  bag,
  compact = false,
}: {
  bag: Bag;
  compact?: boolean;
}) {
  const tradable = bagTradable(bag);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bag.title}. ${bag.subtitle}. ${bag.assets.length} tokens. ${
        tradable ? "Open to buy" : "Research only"
      }`}
      accessibilityHint="Opens the bag"
      onPress={() =>
        router.push({ pathname: "/bag/[id]", params: { id: bag.id } })
      }
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <BagArt
        bag={bag}
        height={compact ? 172 : 232}
        logoSize={compact ? 46 : 60}
        showThemeIcon={false}
        logosOnTop
      >
        <View style={styles.save}>
          <SaveButton bagId={bag.id} title={bag.title} variant="glass" />
        </View>
        <View style={styles.overlay}>
          <T
            variant={compact ? "title2" : "title1"}
            style={styles.title}
            numberOfLines={1}
          >
            {bag.title}
          </T>
          <T variant="footnote" style={styles.subtitle} numberOfLines={1}>
            {bag.subtitle}
          </T>
          <View style={styles.meta}>
            <TradeStatus bag={bag} onArt />
            <T variant="caption" style={styles.count}>
              {bag.assets.length} tokens
            </T>
          </View>
        </View>
      </BagArt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...rounded(28),
    overflow: "hidden",
    shadowColor: "#1B2250",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.96 },
  save: { position: "absolute", top: 10, right: 10 },
  overlay: { paddingHorizontal: 18, paddingBottom: 16, gap: 2 },
  title: { color: "#FFFFFF" },
  subtitle: { color: "rgba(255,255,255,0.9)" },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  count: { color: "rgba(255,255,255,0.9)", fontWeight: "600" },
});

const statusStyles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    variants: {
      tradable: {
        true: { backgroundColor: theme.ds.mintSoft },
        false: { backgroundColor: theme.ds.sunken },
      },
      onArt: {
        true: { backgroundColor: "rgba(255,255,255,0.24)" },
        false: {},
      },
    },
  },
  label: {
    fontWeight: "700",
    variants: {
      tradable: {
        true: { color: theme.ds.positive },
        false: { color: theme.ds.inkSecondary },
      },
      onArt: {
        true: { color: "#FFFFFF" },
        false: {},
      },
    },
  },
}));

const preIpoStyles = StyleSheet.create((theme) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    variants: {
      onArt: {
        true: { backgroundColor: "rgba(255,255,255,0.24)" },
        false: { backgroundColor: theme.ds.lilacSoft },
      },
    },
  },
  label: {
    fontWeight: "700",
    variants: {
      onArt: {
        true: { color: "#FFFFFF" },
        false: { color: theme.ds.lilac },
      },
    },
  },
}));
