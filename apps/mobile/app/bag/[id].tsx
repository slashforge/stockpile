import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import * as WebBrowser from "expo-web-browser";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AllocationBar, useAssetColors } from "@/components/stockpile/allocation";
import { BagArt } from "@/components/stockpile/bag-art";
import { bagTradable, TradeStatus } from "@/components/stockpile/bag-card";
import { Card, Collapsible, Divider, MessageState, Screen, Skeleton } from "@/components/stockpile/layout";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { SaveButton } from "@/components/stockpile/save-button";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { T } from "@/components/stockpile/type";
import { useBuySheet } from "@/components/stockpile/buy-sheet";
import { useBag } from "@/hooks/use-bags";
import { collectStories, useBagStories } from "@/hooks/use-feed";
import { connectionFor, type Story } from "@/services/api/feed";
import { formatStoryDate } from "@/components/stockpile/story-reel";
import { useStockpileAuth } from "@/providers/auth-context";
import { issuerMarkLabel } from "@/lib/pre-ipo";
import type { Bag } from "@/services/api/types";
import { formatBps } from "@/utils/amounts";

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function openLink(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}

function Holdings({ bag }: { bag: Bag }) {
  const colors = useAssetColors(bag.assets);
  const { theme } = useUnistyles();
  const max = Math.max(...bag.assets.map((asset) => asset.weightBps), 1);
  return (
    <Card padded={false}>
      <View style={styles.barWrap}>
        <AllocationBar assets={bag.assets} height={14} />
      </View>
      {bag.assets.map((asset, index) => (
        <View key={`${asset.symbol}-${index}`}>
          <Divider inset={76} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${asset.symbol}, ${asset.name}, ${formatBps(asset.weightBps)}. ${
              asset.mint ? "" : "Token mint not yet verified. "
            }Opens the source for why it's included.`}
            onPress={() => openLink(asset.sourceUrl)}
            style={({ pressed }) => [styles.assetRow, pressed && styles.pressed]}
          >
            <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} size={44} ring={colors[index]} />
            <View style={styles.flex}>
              <View style={styles.assetTitle}>
                <T variant="headline">{asset.symbol}</T>
                {asset.mint ? null : (
                  <View style={styles.unverified}>
                    <T variant="caption" tone="caution" style={styles.bold}>
                      Mint unverified
                    </T>
                  </View>
                )}
              </View>
              <T variant="footnote" tone="secondary" numberOfLines={1}>
                {asset.name}
              </T>
              {issuerMarkLabel(asset) ? (
                <T variant="caption" tone="tertiary" numberOfLines={1}>
                  {issuerMarkLabel(asset)} · not a quote
                </T>
              ) : null}
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${(asset.weightBps / max) * 100}%`, backgroundColor: colors[index] }]}
                />
              </View>
            </View>
            <View style={styles.weightCol}>
              <T variant="title3" style={styles.tabular}>
                {formatBps(asset.weightBps)}
              </T>
              <Ionicons name="open-outline" size={14} color={theme.ds.inkTertiary} />
            </View>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

const STANCE = {
  supporting: { label: "Supports", icon: "trending-up" },
  opposing: { label: "Challenges", icon: "trending-down" },
  neutral: { label: "Context", icon: "information-circle" },
} as const;

function StoryRow({ story, bagId }: { story: Story; bagId: string }) {
  const { theme } = useUnistyles();
  const connection = connectionFor(story, bagId);
  const stance = connection ? STANCE[connection.context] : null;
  const date = formatStoryDate(story.publishedAt);
  const fg =
    connection?.context === "supporting"
      ? theme.ds.positive
      : connection?.context === "opposing"
        ? theme.ds.danger
        : theme.ds.inkSecondary;
  const bg =
    connection?.context === "supporting"
      ? theme.ds.mintSoft
      : connection?.context === "opposing"
        ? theme.ds.coralSoft
        : theme.ds.sunken;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${stance ? `${stance.label}: ` : ""}${story.title}. ${story.publisher}${date ? `, ${date}` : ""}`}
      onPress={() => openLink(story.sourceUrl)}
      style={({ pressed }) => [styles.story, pressed && styles.pressed]}
    >
      {stance ? (
        <View style={[styles.stance, { backgroundColor: bg }]}>
          <Ionicons name={stance.icon} size={12} color={fg} />
          <T variant="caption" style={[styles.bold, { color: fg }]}>
            {stance.label}
          </T>
        </View>
      ) : null}
      <T variant="callout" style={styles.bold} numberOfLines={3}>
        {story.title}
      </T>
      {connection?.explanation ? (
        <T variant="footnote" tone="secondary" numberOfLines={3}>
          {connection.explanation}
        </T>
      ) : null}
      <T variant="caption" tone="tertiary">
        {story.publisher}
        {date ? ` · ${date}` : ""} · {hostOf(story.sourceUrl)}
        {story.format === "podcast" ? " · Podcast" : ""}
        {story.provenance === "ai" ? " · AI summary" : ""}
      </T>
    </Pressable>
  );
}

function RelatedStories({ bagId }: { bagId: string }) {
  const stories = useBagStories(bagId);
  if (stories.isPending) return <Skeleton height={64} radius={18} />;
  const result = collectStories(stories.data?.pages);
  const list = result.status === "live" ? result.stories : [];
  const count = (context: "supporting" | "opposing") =>
    list.filter((story) => connectionFor(story, bagId)?.context === context).length;
  const summary = stories.isError
    ? "Couldn't load stories"
    : result.status === "unavailable"
      ? result.message
      : list.length === 0
        ? "No related stories yet"
        : `${count("supporting")} supporting · ${count("opposing")} challenging`;
  return (
    <Collapsible title="Stories" icon="newspaper" tint="coral" count={list.length || undefined} summary={summary}>
      {list.length === 0 ? (
        <T variant="footnote" tone="secondary">
          {summary}
        </T>
      ) : (
        <>
          {list.map((story) => (
            <StoryRow key={story.id} story={story} bagId={bagId} />
          ))}
          {stories.hasNextPage ? (
            <PrimaryButton
              label="More stories"
              variant="ghost"
              size="md"
              loading={stories.isFetchingNextPage}
              onPress={() => stories.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </Collapsible>
  );
}

// Fallback only; the API supplies bag-specific risks.
const GENERAL_RISKS = [
  "Inclusion and weights are Stockpile's reading of the sources, not claims by them or a recommendation.",
  "Tokenized stocks are issued by third parties, may not carry shareholder rights and can trade away from the share price.",
  "Prices can fall. Swaps have slippage and network fees, and you may lose money.",
];

function DetailSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading bag">
      <Skeleton height={240} radius={28} />
      <Skeleton height={30} width="60%" />
      <Skeleton height={16} width="80%" />
      <Skeleton height={220} radius={24} />
    </View>
  );
}

export default function BagScreen() {
  const { id, buy } = useLocalSearchParams<{ id: string; buy?: string }>();
  const bag = useBag(id);
  const auth = useStockpileAuth();
  const { theme } = useUnistyles();
  const { openBuy } = useBuySheet();

  // `stockpile://bag/<id>?buy=1` opens "Put money in the bag" once the bag has loaded.
  const autoBuyDone = useRef(false);
  const loaded = !!bag.data;
  useEffect(() => {
    if (buy !== "1" || !loaded || !id || autoBuyDone.current) return;
    autoBuyDone.current = true;
    // Not cancelled on cleanup: clearing the param below re-runs this effect.
    setTimeout(() => {
      openBuy(id);
      // Consume the param so a remount/reload of this screen doesn't reopen the sheet.
      router.setParams({ buy: undefined });
    }, 400);
  }, [buy, loaded, id, openBuy]);

  if (!bag.data) {
    return (
      <Screen back>
        {bag.isError ? (
          <MessageState
            tone="error"
            icon="alert-circle-outline"
            title="Bag unavailable"
            body={bag.error.message}
            actionLabel="Try again"
            onAction={() => bag.refetch()}
          />
        ) : (
          <DetailSkeleton />
        )}
      </Screen>
    );
  }

  const data = bag.data;
  const tradable = bagTradable(data);
  const unverified = data.assets.filter((asset) => !asset.mint).length;

  // Signed-out users go through the sign-in sheet and land in the buy sheet afterwards.
  const tradeCta = () => openBuy(data.id);

  return (
    <Screen
      back
      right={<SaveButton bagId={data.id} title={data.title} variant="circle" />}
      onRefresh={() => bag.refetch()}
      footer={
        auth.configured ? (
          <>
            {!tradable ? (
              <View style={styles.footerNote}>
                <Ionicons name="lock-closed" size={13} color={theme.ds.inkSecondary} />
                <T variant="footnote" tone="secondary">
                  {unverified === data.assets.length
                    ? "Research only until token mints are verified"
                    : `${unverified} of ${data.assets.length} token mints still unverified`}
                </T>
              </View>
            ) : null}
            <PrimaryButton
              label={auth.authenticated ? "Put money in the bag" : "Sign in to buy"}
              icon={auth.authenticated ? "add-circle" : "mail"}
              onPress={tradeCta}
              disabled={auth.authenticated && !tradable}
              accessibilityHint="Get a quote and review each transaction before signing"
            />
          </>
        ) : undefined
      }
    >
      <BagArt bag={data} height={230} logoSize={72} style={styles.hero}>
        <View style={styles.heroStatus}>
          <TradeStatus bag={data} onArt />
        </View>
      </BagArt>

      <View style={styles.titleBlock}>
        <T variant="title1" accessibilityRole="header">
          {data.title}
        </T>
        <T variant="callout" tone="secondary">
          {data.subtitle}
        </T>
      </View>

      <View style={styles.stats}>
        <Stat icon="pie-chart" tint={theme.ds.accent} bg={theme.ds.accentSoft} value={`${data.assets.length}`} label="Assets" />
        <Stat
          icon="document-text"
          tint={theme.ds.lilac}
          bg={theme.ds.lilacSoft}
          value={`${data.sources.length}`}
          label={data.sources.length === 1 ? "Source" : "Sources"}
        />
        <Stat
          icon={tradable ? "flash" : "book"}
          tint={tradable ? theme.ds.positive : theme.ds.coral}
          bg={tradable ? theme.ds.mintSoft : theme.ds.coralSoft}
          value={tradable ? "Open" : "Research"}
          label="Status"
        />
      </View>

      <View style={styles.sectionHeader}>
        <T variant="title3" accessibilityRole="header">
          What’s inside
        </T>
        <T variant="caption" tone="tertiary">
          Target weights · tap for source
        </T>
      </View>
      <Holdings bag={data} />

      <View style={styles.sections}>
        <RelatedStories bagId={data.id} />
        <Collapsible title="Why this bag" icon="bulb" tint="accent" summary={data.thesis}>
          <T variant="callout">{data.thesis}</T>
          {data.description ? (
            <T variant="footnote" tone="secondary">
              {data.description}
            </T>
          ) : null}
        </Collapsible>

        <Collapsible
          title="Evidence"
          icon="document-text"
          tint="lilac"
          count={data.sources.length}
          summary={data.sources.length ? data.sources.map((s) => hostOf(s.url)).join(" · ") : "No sources attached yet"}
        >
          {data.sources.map((source) => (
            <Pressable
              key={source.url}
              accessibilityRole="link"
              accessibilityLabel={`Open source: ${source.title}`}
              onPress={() => openLink(source.url)}
              style={({ pressed }) => [styles.source, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <T variant="callout" style={styles.bold} numberOfLines={3}>
                  {source.title}
                </T>
                <T variant="footnote" tone="secondary">
                  {hostOf(source.url)}
                </T>
              </View>
              <Ionicons name="open-outline" size={16} color={theme.ds.accent} />
            </Pressable>
          ))}
        </Collapsible>

        <Collapsible title="Risks & disclosure" icon="shield-checkmark" tint="caution" summary={data.disclosure}>
          <T variant="callout">{data.disclosure}</T>
          {(data.risks.length > 0 ? data.risks : GENERAL_RISKS).map((risk) => (
            <View key={risk} style={styles.riskItem}>
              <View style={styles.riskBullet} />
              <T variant="footnote" tone="secondary" style={styles.flex}>
                {risk}
              </T>
            </View>
          ))}
        </Collapsible>
      </View>
    </Screen>
  );
}

function Stat({
  icon,
  tint,
  bg,
  value,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tint: string;
  bg: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <T variant="headline" numberOfLines={1}>
        {value}
      </T>
      <T variant="caption" tone="tertiary">
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  bold: { fontWeight: "600" },
  pressed: { backgroundColor: theme.ds.scrim },
  hero: { ...theme.rounded(28) },
  heroStatus: { position: "absolute", top: 14, right: 14 },
  titleBlock: { gap: 4, marginTop: 4 },
  stats: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: theme.ds.surface,
    ...theme.rounded(20),
    padding: 14,
    gap: 4,
    shadowColor: "#1B2250",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  statIcon: { width: 30, height: 30, ...theme.rounded(10), alignItems: "center", justifyContent: "center", marginBottom: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 },
  barWrap: { padding: 16 },
  assetRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  assetTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  unverified: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.ds.cautionSoft,
  },
  track: { height: 5, borderRadius: 3, backgroundColor: theme.ds.sunken, marginTop: 8, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
  weightCol: { alignItems: "flex-end", gap: 6 },
  tabular: { fontVariant: ["tabular-nums"] },
  sections: { gap: 12, marginTop: 8 },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    ...theme.rounded(14),
    backgroundColor: theme.ds.canvas,
  },
  story: { gap: 6, padding: 12, ...theme.rounded(14), backgroundColor: theme.ds.canvas },
  stance: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  riskItem: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  riskBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.ds.caution, marginTop: 7 },
  footerNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  skeleton: { gap: 14, marginTop: 4 },
}));
