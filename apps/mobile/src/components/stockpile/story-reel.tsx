import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { PixelRatio, Text, useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { isPreIpoBag } from "@/lib/pre-ipo";
import { useBagReturns } from "@/hooks/use-returns";
import { parseHex } from "@/lib/asset-colors";
import { bagCurator, isDisclosureStory } from "@/lib/market";
import { displayTicker, isSharpEnough, leadAsset, storyAge, storyImageSources } from "@/lib/story";
import { connectionFor, type Story } from "@/services/api/feed";
import type { Bag } from "@/services/api/types";
import { safeIconUrl } from "@/utils/token-icon";
import { bagTheme, LogoCluster } from "./bag-art";
import { BagReturnsLine, CuratorLine } from "./market";
import { TokenAvatar } from "./token-avatar";
import { T } from "./type";
import { HapticPressable } from "./haptic-pressable";

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

function rgba(hex: string, alpha: number) {
  const rgb = parseHex(hex);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : `rgba(77,163,255,${alpha})`;
}

const INK = "rgba(9,11,20,";
/** Share of the reel height the photo occupies before fading into the text area. */
const PHOTO_SHARE = 0.7;

/**
 * Photo layout: the photo fills the top of the reel edge to edge and fades into the dark text
 * area, so landscape news photos lose far less to cropping than a full-screen cover would.
 * Photos too small to fill that area sharply are rejected via `onSoft` (poster shows instead).
 */
function PhotoBackdrop({
  uri,
  box,
  height,
  onError,
  onSoft,
}: {
  uri: string;
  box: { width: number; height: number };
  height: number;
  onError: () => void;
  onSoft: () => void;
}) {
  const [ready, setReady] = useState(false);
  return (
    <View
      style={[styles.photo, { height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}
        contentFit="cover"
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={200}
        onError={onError}
        onLoad={({ source }) => {
          if (!isSharpEnough(source, box)) return onSoft();
          setReady(true);
        }}
        accessibilityIgnoresInvertColors
      />
      {ready ? (
        <LinearGradient
          colors={[`${INK}0)`, `${INK}0.35)`, `${INK}0.85)`, `${INK}1)`]}
          locations={[0.45, 0.68, 0.88, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

/**
 * No-photo layout (filings, feeds without media): a quiet brand-tinted wash with the lead company
 * set as type. Logos stay at their native size so they never render soft.
 */
function PosterBackdrop({ story, bag, topInset, showLead }: { story: Story; bag: Bag | undefined; topInset: number; showLead: boolean }) {
  const { theme } = useUnistyles();
  const seed = hashString(story.id);
  const lead = bag ? leadAsset(`${story.title} ${story.summary}`, bag.assets) : undefined;
  const fallback = theme.gradients[bag ? bagTheme(bag).gradient : (["blue", "rose", "coral", "mint", "sky"] as const)[seed % 5]];
  const brand = lead?.brandColor && parseHex(lead.brandColor) ? lead.brandColor : fallback[0];
  const company = lead?.name.replace(/\s+(xStocks?|PreStocks?|Tokenized.*|Token)$/i, "").trim();

  return (
    <View style={[StyleSheet.absoluteFill, styles.poster]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {showLead ? (
        <LinearGradient
          colors={[rgba(brand, 0.55), rgba(fallback[1], 0.18), `${INK}0)`]}
          locations={[0, 0.4, 0.75]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.3, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {lead && showLead ? (
        <View style={[styles.posterLead, { top: topInset + 72 }]}>
          <View style={styles.posterLogo}>
            <TokenAvatar symbol={lead.symbol} iconUrl={lead.iconUrl} size={56} />
          </View>
          <Text style={styles.posterTicker} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1}>
            {displayTicker(lead.symbol)}
          </Text>
          {company ? (
            <Text style={styles.posterCompany} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {company}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ReelBackdrop({ story, bag, height, topInset }: { story: Story; bag: Bag | undefined; height: number; topInset: number }) {
  const { width } = useWindowDimensions();
  const imageUrl = safeIconUrl(story.imageUrl);
  const scale = PixelRatio.get();
  const photoHeight = Math.round(height * PHOTO_SHARE);
  const box = useMemo(() => ({ width: width * scale, height: photoHeight * scale }), [width, photoHeight, scale]);
  // Landscape sources cover the photo area at its height, so request the width that needs.
  const sources = useMemo(
    () => (imageUrl ? storyImageSources(imageUrl, Math.max(box.width, (box.height * 16) / 9)) : []),
    [imageUrl, box],
  );
  const [failed, setFailed] = useState<string[]>([]);
  const [soft, setSoft] = useState(false);
  const uri = soft ? undefined : sources.find((source) => !failed.includes(source));
  return (
    <>
      <PosterBackdrop story={story} bag={bag} topInset={topInset} showLead={!uri} />
      {uri ? (
        <PhotoBackdrop
          key={uri}
          uri={uri}
          box={box}
          height={photoHeight}
          onError={() => setFailed((prev) => [...prev, uri])}
          onSoft={() => setSoft(true)}
        />
      ) : null}
    </>
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
  const age = storyAge(story.publishedAt);
  const hasImage = !!safeIconUrl(story.imageUrl);
  const connection = bag ? connectionFor(story, bag.id) : undefined;
  const podcast = story.format === "podcast";
  const disclosure = isDisclosureStory(story);
  const lead = bag ? leadAsset(`${story.title} ${story.summary}`, bag.assets) : undefined;
  const kickerColor = lead?.brandColor && parseHex(lead.brandColor) ? lead.brandColor : theme.ds.accent;
  const kind = podcast ? "Podcast" : disclosure ? "Disclosure" : "News";
  const cta = podcast ? "Listen" : disclosure ? "View filing" : "Read story";

  return (
    <View style={[styles.reel, { height }]}>
      <ReelBackdrop key={story.id} story={story} bag={bag} height={height} topInset={topInset} />
      <LinearGradient
        colors={[`${INK}0.55)`, `${INK}0)`]}
        style={[styles.topScrim, { height: topInset + 90 }]}
        pointerEvents="none"
      />

      <View style={[styles.top, { paddingTop: topInset + 8 }]}>
        <View style={styles.glassChip}>
          <Ionicons
            name={podcast ? "headset" : disclosure ? "document-text" : "newspaper"}
            size={13}
            color="#FFFFFF"
          />
          <T variant="caption" style={styles.chipText}>
            {kind}
          </T>
        </View>
        {story.provenance === "ai" ? (
          <View style={styles.glassChip} accessibilityLabel="Summary paraphrased by AI from the source">
            <Ionicons name="sparkles" size={12} color="#FFFFFF" />
            <T variant="caption" style={styles.chipText}>
              AI summary
            </T>
          </View>
        ) : null}
        {bag && isPreIpoBag(bag) ? (
          <View style={styles.glassChip} accessibilityLabel="Pre-IPO bag">
            <Ionicons name="hourglass-outline" size={13} color="#FFFFFF" />
            <T variant="caption" style={styles.chipText}>
              Pre-IPO
            </T>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: bottomInset + 12 }]}>
        <View style={styles.kicker}>
          <View style={[styles.kickerBar, { backgroundColor: kickerColor }]} />
          <T variant="overline" style={styles.kickerText} numberOfLines={1}>
            {story.publisher}
          </T>
          {age ? (
            <T variant="caption" style={styles.kickerAge} numberOfLines={1}>
              {age}
            </T>
          ) : null}
        </View>
        <T variant="title1" style={styles.headline} numberOfLines={4} accessibilityRole="header">
          {story.title}
        </T>
        <T variant="callout" style={styles.summary} numberOfLines={3}>
          {story.summary}
        </T>

        <View style={styles.actions}>
          <HapticPressable
            accessibilityRole="link"
            accessibilityLabel={`${cta} at ${story.publisher}`}
            accessibilityHint={storyHost(story.sourceUrl)}
            onPress={() => WebBrowser.openBrowserAsync(story.sourceUrl).catch(() => {})}
            style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}
          >
            <T variant="subhead" style={styles.sourceLabel} numberOfLines={1}>
              {cta}
            </T>
            <Ionicons name={podcast ? "play" : "arrow-forward"} size={15} color="#10131F" />
          </HapticPressable>
          <View style={styles.meta}>
            <T variant="caption" style={styles.metaText} numberOfLines={1}>
              {storyHost(story.sourceUrl)}
            </T>
            {connection && connection.relationship !== "direct" ? (
              <T variant="caption" style={styles.metaText} numberOfLines={1}>
                Related theme
              </T>
            ) : hasImage && story.imageCredit ? (
              <T variant="caption" style={styles.metaText} numberOfLines={1}>
                Image: {story.imageCredit}
              </T>
            ) : null}
          </View>
        </View>

        {bag ? (
          <HapticPressable
            haptic="light"
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
              <BagReturnsLine entry={returns.data?.[bag.id]} loading={returns.isPending} compact />
              <CuratorLine curator={bagCurator(bag)} />
            </View>
            {bags.length > 1 ? (
              <T variant="caption" tone="secondary" style={styles.more}>
                +{bags.length - 1}
              </T>
            ) : null}
            <View style={styles.bagChevron}>
              <Ionicons name="chevron-up" size={18} color={theme.ds.accent} />
            </View>
          </HapticPressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  reel: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#090B14",
    justifyContent: "space-between",
  },
  poster: { backgroundColor: "#090B14" },
  photo: { position: "absolute", top: 0, left: 0, right: 0 },
  photoFrame: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  posterLead: { position: "absolute", left: theme.density.gutter, right: theme.density.gutter, gap: 6 },
  posterLogo: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    marginBottom: 10,
  },
  posterTicker: { color: "#FFFFFF", fontSize: 64, lineHeight: 68, fontWeight: "900", letterSpacing: -2 },
  posterCompany: { color: "rgba(255,255,255,0.62)", fontSize: 17, fontWeight: "600" },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0 },
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
    backgroundColor: "rgba(16,19,31,0.42)",
    maxWidth: "100%",
  },
  chipText: { color: "#FFFFFF", fontWeight: "600" },
  bottom: { paddingHorizontal: theme.density.gutter, gap: theme.density.item },
  kicker: { flexDirection: "row", alignItems: "center", gap: 8 },
  kickerBar: { width: 3, height: 14, borderRadius: 2 },
  kickerText: { color: "#FFFFFF", letterSpacing: 1.2, flexShrink: 1 },
  kickerAge: { color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  headline: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: -0.4,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  summary: { color: "rgba(255,255,255,0.84)" },
  actions: { flexDirection: "row", alignItems: "center", gap: theme.density.item, marginTop: 2 },
  sourceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  sourceLabel: { color: "#10131F", fontWeight: "700" },
  meta: { flex: 1, gap: 1 },
  metaText: { color: "rgba(255,255,255,0.62)" },
  bagCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.density.rowGap,
    padding: 10,
    paddingLeft: theme.density.rowY,
    ...theme.rounded(24),
    backgroundColor: theme.ds.surface,
    marginTop: 4,
  },
  bagChevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accentSoft,
  },
  more: { fontWeight: "700" },
  flex: { flex: 1, gap: 1 },
  pressed: { opacity: 0.8 },
}));
