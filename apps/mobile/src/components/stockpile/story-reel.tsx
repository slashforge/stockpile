import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { isPreIpoBag } from "@/lib/pre-ipo";
import { useBagReturns } from "@/hooks/use-returns";
import { bagCurator, isDisclosureStory } from "@/lib/market";
import { connectionFor, type Story } from "@/services/api/feed";
import type { Bag } from "@/services/api/types";
import { safeIconUrl } from "@/utils/token-icon";
import { bagTheme, LogoCluster } from "./bag-art";
import { BagReturnsLine, CuratorLine } from "./market";
import { T } from "./type";

export function formatStoryDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function storyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Full-bleed artwork: the publisher image when provided, otherwise a designed bag-themed fallback. */
function ReelBackdrop({ story, bag }: { story: Story; bag: Bag | undefined }) {
  const { theme } = useUnistyles();
  const imageUrl = safeIconUrl(story.imageUrl);
  const [failed, setFailed] = useState(false);
  // Vary artwork per story (not per bag) so consecutive reels feel distinct.
  const seed = hashString(story.id);
  const names = ["blue", "rose", "coral", "mint", "sky"] as const;
  const gradient =
    theme.gradients[
      bag && seed % 3 === 0
        ? bagTheme(bag).gradient
        : names[seed % names.length]
    ];
  const shift = (seed % 7) * 18 - 54;

  if (imageUrl && !failed) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.orb,
          styles.orbA,
          { transform: [{ translateX: shift }] },
        ]}
      />
      <View
        style={[
          styles.orb,
          styles.orbB,
          { transform: [{ translateY: shift }] },
        ]}
      />
      <View
        style={[
          styles.orb,
          styles.orbC,
          { transform: [{ translateX: -shift }, { translateY: shift / 2 }] },
        ]}
      />
      {bag ? (
        <View style={styles.fallbackLogos}>
          <LogoCluster assets={bag.assets} size={84} limit={4} />
        </View>
      ) : null}
    </View>
  );
}

export function StoryReel({
  story,
  bags,
  height,
  topInset,
  bottomInset,
  onOpenBag,
}: {
  story: Story;
  bags: Bag[];
  height: number;
  topInset: number;
  bottomInset: number;
  onOpenBag: (bagId: string) => void;
}) {
  const { theme } = useUnistyles();
  const bag = bags[0];
  const returns = useBagReturns();
  const date = formatStoryDate(story.publishedAt);
  const hasImage = !!safeIconUrl(story.imageUrl);
  const connection = bag ? connectionFor(story, bag.id) : undefined;
  const podcast = story.format === "podcast";
  const disclosure = isDisclosureStory(story);
  const sourceIcon = podcast
    ? "headset"
    : disclosure
      ? "document-text-outline"
      : "open-outline";

  return (
    <View style={[styles.reel, { height }]}>
      <ReelBackdrop story={story} bag={bag} />
      <LinearGradient
        colors={[
          "rgba(10,12,24,0.35)",
          "rgba(10,12,24,0)",
          "rgba(10,12,24,0.15)",
          "rgba(10,12,24,0.82)",
        ]}
        locations={[0, 0.2, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.top, { paddingTop: topInset + 8 }]}>
        <View style={styles.glassChip}>
          <Ionicons
            name={
              podcast ? "headset" : disclosure ? "document-text" : "newspaper"
            }
            size={13}
            color="#FFFFFF"
          />
          <T variant="caption" style={styles.chipText} numberOfLines={1}>
            {podcast ? "Podcast · " : disclosure ? "Disclosure · " : ""}
            {story.publisher}
            {date ? ` · ${date}` : ""}
          </T>
        </View>
        {story.provenance === "ai" ? (
          <View
            style={styles.glassChip}
            accessibilityLabel="Summary paraphrased by AI from the source"
          >
            <Ionicons name="sparkles" size={12} color="#FFFFFF" />
            <T variant="caption" style={styles.chipText}>
              AI summary
            </T>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: bottomInset + 12 }]}>
        {bag ? (
          <View style={styles.tags}>
            {isPreIpoBag(bag) ? (
              <View style={styles.glassChip} accessibilityLabel="Pre-IPO bag">
                <Ionicons name="hourglass-outline" size={13} color="#FFFFFF" />
                <T variant="caption" style={styles.chipText}>
                  Pre-IPO
                </T>
              </View>
            ) : null}
            {connection && connection.relationship !== "direct" ? (
              <View style={styles.glassChip}>
                <Ionicons name="git-branch-outline" size={13} color="#FFFFFF" />
                <T variant="caption" style={styles.chipText} numberOfLines={1}>
                  Related theme
                </T>
              </View>
            ) : null}
            {bags.length > 1 ? (
              <View style={styles.glassChip}>
                <Ionicons name="layers-outline" size={13} color="#FFFFFF" />
                <T variant="caption" style={styles.chipText} numberOfLines={1}>
                  +{bags.length - 1} more {bags.length === 2 ? "bag" : "bags"}
                </T>
              </View>
            ) : null}
          </View>
        ) : null}
        <T
          variant="title1"
          style={styles.headline}
          numberOfLines={4}
          accessibilityRole="header"
        >
          {story.title}
        </T>
        <T variant="callout" style={styles.summary} numberOfLines={3}>
          {story.summary}
        </T>
        {hasImage && story.imageCredit ? (
          <T variant="caption" style={styles.credit} numberOfLines={1}>
            Image: {story.imageCredit}
          </T>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${
              podcast
                ? "Listen to the episode"
                : disclosure
                  ? "View the filing"
                  : "Read the full story"
            } at ${story.publisher}`}
            accessibilityHint={storyHost(story.sourceUrl)}
            onPress={() =>
              WebBrowser.openBrowserAsync(story.sourceUrl).catch(() => {})
            }
            style={({ pressed }) => [
              styles.sourceButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name={sourceIcon} size={15} color="#FFFFFF" />
            <T variant="subhead" style={styles.chipText} numberOfLines={1}>
              {disclosure
                ? `View filing · ${storyHost(story.sourceUrl)}`
                : storyHost(story.sourceUrl)}
            </T>
          </Pressable>
        </View>

        {bag ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Related bag: ${bag.title}${bags.length > 1 ? `, and ${bags.length - 1} more` : ""}`}
            accessibilityHint="Opens the bag summary"
            onPress={() => onOpenBag(bag.id)}
            style={({ pressed }) => [styles.bagCard, pressed && styles.pressed]}
          >
            <LogoCluster assets={bag.assets} size={34} limit={3} />
            <View style={styles.flex}>
              <T variant="headline" numberOfLines={1}>
                {bag.title}
              </T>
              <BagReturnsLine
                entry={returns.data?.[bag.id]}
                loading={returns.isPending}
                compact
              />
              <CuratorLine curator={bagCurator(bag)} />
            </View>
            <View style={styles.bagChevron}>
              <Ionicons name="chevron-up" size={18} color={theme.ds.accent} />
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  reel: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: theme.ds.ink,
    justifyContent: "space-between",
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  orbA: { width: 360, height: 360, top: -90, right: -120 },
  orbB: { width: 220, height: 220, top: 260, left: -90 },
  orbC: {
    width: 120,
    height: 120,
    top: 150,
    right: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  fallbackLogos: {
    position: "absolute",
    top: "24%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  top: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.density.item,
    paddingHorizontal: theme.density.gutter,
  },
  glassChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(16,19,31,0.38)",
    maxWidth: "100%",
  },
  chipText: { color: "#FFFFFF", fontWeight: "600" },
  bottom: { paddingHorizontal: theme.density.gutter, gap: theme.density.item },
  headline: {
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  summary: { color: "rgba(255,255,255,0.92)" },
  credit: { color: "rgba(255,255,255,0.7)" },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  actions: { flexDirection: "row", gap: theme.density.item },
  sourceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.4)",
    maxWidth: "100%",
  },
  bagCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.density.rowGap,
    padding: 10,
    paddingLeft: theme.density.rowY,
    ...theme.rounded(24),
    backgroundColor: theme.ds.surface,
    marginTop: 2,
  },
  bagChevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accentSoft,
  },
  flex: { flex: 1, gap: 1 },
  pressed: { opacity: 0.8 },
}));
