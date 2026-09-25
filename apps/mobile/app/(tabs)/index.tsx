import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { LogoCluster } from "@/components/stockpile/bag-art";
import { Skeleton } from "@/components/stockpile/layout";
import { useBagSheet } from "@/components/stockpile/bag-sheet";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { StoryReel } from "@/components/stockpile/story-reel";
import { T } from "@/components/stockpile/type";
import { useBags } from "@/hooks/use-bags";
import { collectStories, useFeed } from "@/hooks/use-feed";
import { relatedBags, type Story } from "@/services/api/feed";
import type { Bag } from "@/services/api/types";

/** Full-screen, bright, honest state used for loading/unavailable/empty/error. */
function FeedState({
  icon,
  title,
  body,
  bags,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  onOpenBag,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
  bags?: Bag[];
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onOpenBag?: (bagId: string) => void;
}) {
  const { theme } = useUnistyles();
  const logos = (bags ?? []).flatMap((bag) => bag.assets).filter(
    (asset, index, all) => all.findIndex((other) => other.symbol === asset.symbol) === index,
  );
  return (
    <View style={styles.state}>
      <LinearGradient
        colors={[theme.ds.accentSoft, theme.ds.lilacSoft, theme.ds.canvas]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobA]} />
      <View style={[styles.blob, styles.blobB]} />
      <View style={styles.stateInner}>
        {logos.length > 0 ? (
          <LogoCluster assets={logos} size={62} limit={5} />
        ) : (
          <View style={styles.stateIcon}>
            <Ionicons name={icon} size={34} color="#FFFFFF" />
          </View>
        )}
        <T variant="title1" align="center">
          {title}
        </T>
        <T variant="callout" tone="secondary" align="center" style={styles.stateBody}>
          {body}
        </T>
        {actionLabel && onAction ? (
          <PrimaryButton label={actionLabel} onPress={onAction} style={styles.stateAction} icon="layers" />
        ) : null}
        {secondaryLabel && onSecondary ? (
          <PrimaryButton label={secondaryLabel} onPress={onSecondary} variant="ghost" size="md" icon="refresh" />
        ) : null}
      </View>
      {onOpenBag && bags && bags.length > 0 ? (
        <View style={styles.peekWrap}>
          <T variant="overline" tone="tertiary" align="center">
            Peek inside a bag
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peekRow}>
            {bags.map((bag) => (
              <Pressable
                key={bag.id}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${bag.title}`}
                onPress={() => onOpenBag(bag.id)}
                style={({ pressed }) => [styles.peek, pressed && styles.pressed]}
              >
                <LogoCluster assets={bag.assets} size={28} limit={3} />
                <T variant="subhead" numberOfLines={1}>
                  {bag.title}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function FeedLoading() {
  return (
    <View style={styles.state} accessibilityLabel="Loading stories" accessibilityRole="progressbar">
      <View style={styles.loadingInner}>
        <Skeleton height={32} width="80%" radius={10} />
        <Skeleton height={32} width="60%" radius={10} />
        <Skeleton height={18} width="90%" />
        <Skeleton height={64} radius={24} />
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const feed = useFeed();
  const bags = useBags();
  const { openBag } = useBagSheet();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  // Spinner only for user pulls; background refetches must not show it (stuck spinner on iOS).
  const [pulling, setPulling] = useState(false);

  const bagsById = useMemo(() => new Map((bags.data ?? []).map((bag) => [bag.id, bag])), [bags.data]);

  const renderItem = useCallback(
    ({ item }: { item: Story }) => (
      <StoryReel
        story={item}
        bags={relatedBags(item, bagsById)}
        height={height}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onOpenBag={openBag}
      />
    ),
    [height, insets.top, insets.bottom, openBag, bagsById],
  );

  const collected = collectStories(feed.data?.pages);
  const showingReels = collected.status === "live" && collected.stories.length > 0;

  // Reels are full-bleed dark artwork: use a light status bar only while they are on screen.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(showingReels ? "light" : "dark");
      return () => setStatusBarStyle("dark");
    }, [showingReels]),
  );

  let content: React.ReactNode;
  if (feed.isPending || collected.status === "pending") {
    content = <FeedLoading />;
  } else if (feed.isError) {
    content = (
      <FeedState
        icon="cloud-offline"
        title="Couldn't load stories"
        body={feed.error.message}
        secondaryLabel="Try again"
        onSecondary={() => feed.refetch()}
        actionLabel="Browse bags"
        onAction={() => router.navigate("/bags")}
      />
    );
  } else if (collected.status === "unavailable") {
    content = (
      <FeedState
        icon="newspaper"
        title="Stories are coming"
        body={`${collected.message} Bags are ready to explore meanwhile.`}
        bags={bags.data}
        actionLabel="Browse bags"
        onAction={() => router.navigate("/bags")}
        secondaryLabel="Check again"
        onSecondary={() => feed.refetch()}
        onOpenBag={openBag}
      />
    );
  } else if (collected.stories.length === 0) {
    content = (
      <FeedState
        icon="sparkles"
        title="All caught up"
        body="New stories appear here as sources publish them."
        bags={bags.data}
        actionLabel="Browse bags"
        onAction={() => router.navigate("/bags")}
        onOpenBag={openBag}
      />
    );
  } else if (height > 0) {
    content = (
      <FlatList
        data={collected.stories}
        keyExtractor={(story) => story.id}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        contentInsetAdjustmentBehavior="never"
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
        }}
        onEndReachedThreshold={1.5}
        refreshing={pulling}
        onRefresh={async () => {
          setPulling(true);
          try {
            await feed.refetch();
          } finally {
            setPulling(false);
          }
        }}
        accessibilityLabel="Story feed. Swipe up for the next story."
      />
    );
  }

  return (
    <View style={styles.root} onLayout={(event) => setHeight(Math.round(event.nativeEvent.layout.height))}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.ds.canvas },
  state: { flex: 1, justifyContent: "center" },
  blob: { position: "absolute", borderRadius: 999 },
  blobA: { width: 280, height: 280, top: -60, right: -80, backgroundColor: theme.ds.coralSoft },
  blobB: { width: 200, height: 200, bottom: 120, left: -70, backgroundColor: theme.ds.mintSoft },
  stateInner: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 32,
    paddingTop: rt.insets.top,
    paddingBottom: rt.insets.bottom + 40,
  },
  stateIcon: {
    width: 84,
    height: 84,
    ...theme.rounded(28),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accent,
    transform: [{ rotate: "-6deg" }],
    marginBottom: 8,
  },
  stateBody: { maxWidth: 320 },
  peekWrap: { position: "absolute", left: 0, right: 0, bottom: rt.insets.bottom + 24, gap: 10 },
  peekRow: { paddingHorizontal: 20, gap: 10 },
  peek: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 999,
    backgroundColor: theme.ds.surface,
    shadowColor: "#1B2250",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pressed: { opacity: 0.8 },
  stateAction: { marginTop: 12, minWidth: 220 },
  loadingInner: { padding: 24, gap: 12, marginTop: "auto", paddingBottom: rt.insets.bottom + 40 },
}));
