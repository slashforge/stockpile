import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { isPreIpoBag } from "@/lib/pre-ipo";
import { bagCurator, formatSignedPct } from "@/lib/market";
import { pickCardReturns } from "@/lib/returns";
import type { BagReturnEntry } from "@/services/api/returns";
import type { Bag } from "@/services/api/types";
import { BagArt } from "./bag-art";
import { BagReturnsLine, CuratorLine } from "./market";
import { SaveButton } from "./save-button";
import { T } from "./type";
import { density, rounded } from "@/config/sizing";

/** Open to buy only when the server says so AND every asset has a verified mint. */
export function bagTradable(bag: Bag) {
  return (
    bag.tradable &&
    bag.assets.length > 0 &&
    bag.assets.every((asset) => !!asset.mint)
  );
}

/** Why a bag is research-only: the server's reason when given, else the mint check. */
export function researchOnlyReason(bag: Bag): string {
  if (bag.tradableReason) return bag.tradableReason;
  const unverified = bag.assets.filter((asset) => !asset.mint).length;
  if (unverified === 0) return "Research only for now";
  return unverified === bag.assets.length
    ? "Research only until token mints are verified"
    : `${unverified} of ${bag.assets.length} token mints still unverified`;
}

/** Compact tradability chip. Never implies verification from branding. */
/** Small "Pre-IPO" marker for bags holding PreStocks tokens. */
export function PreIpoChip({ onArt = false }: { onArt?: boolean }) {
  const { theme } = useUnistyles();
  preIpoStyles.useVariants({ onArt });
  return (
    <View style={preIpoStyles.chip} accessibilityLabel="Pre-IPO">
      <Ionicons
        name="hourglass-outline"
        size={11}
        color={onArt ? "#FFFFFF" : theme.ds.tertiary}
      />
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
  returns,
  returnsLoading = false,
}: {
  bag: Bag;
  compact?: boolean;
  /** This bag's entry from `useBagReturns()`; fetched once at list level. */
  returns?: BagReturnEntry | null;
  returnsLoading?: boolean;
}) {
  const tradable = bagTradable(bag);
  const tokenCount = `${bag.assets.length} ${bag.assets.length === 1 ? "token" : "tokens"}`;
  const picked = pickCardReturns(returns);
  const returnsA11y = picked
    ? `. ${formatSignedPct(picked.primary.pct)} ${picked.primary.label === "1M" ? "past month" : picked.primary.label}${
        picked.secondary
          ? `, ${formatSignedPct(picked.secondary.pct)} ${picked.secondary.label === "1Y" ? "past year" : picked.secondary.label}`
          : ""
      }`
    : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bag.title}. ${bag.subtitle}${returnsA11y}. ${tokenCount}. ${
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
          <CuratorLine curator={bagCurator(bag)} onArt />
          <View style={styles.returns}>
            <BagReturnsLine entry={returns} loading={returnsLoading} onArt />
          </View>
          <View style={styles.meta}>
            <TradeStatus bag={bag} onArt />
            <T variant="caption" style={styles.count}>
              {tokenCount}
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
  overlay: { paddingHorizontal: density.card, paddingBottom: density.rowY, gap: 2 },
  title: { color: "#FFFFFF" },
  subtitle: { color: "rgba(255,255,255,0.9)" },
  returns: { marginTop: 6 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: density.item, rowGap: 6, marginTop: 6 },
  count: { color: "rgba(255,255,255,0.9)", fontWeight: "600" },
});

const statusStyles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.density.pillX - 1,
    paddingVertical: theme.density.pillY - 1,
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
    paddingHorizontal: theme.density.chipX,
    paddingVertical: theme.density.chipY,
    borderRadius: 999,
    variants: {
      onArt: {
        true: { backgroundColor: "rgba(255,255,255,0.24)" },
        false: { backgroundColor: theme.ds.tertiarySoft },
      },
    },
  },
  label: {
    fontWeight: "700",
    variants: {
      onArt: {
        true: { color: "#FFFFFF" },
        false: { color: theme.ds.tertiary },
      },
    },
  },
}));
