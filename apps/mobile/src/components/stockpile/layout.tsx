import { Ionicons } from "@expo/vector-icons";
import { BlurTargetView } from "expo-blur";
import { router, useFocusEffect, useScrollToTop } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { rounded } from "@/config/sizing";
import { BarBlur, useBlurTarget } from "./bar-blur";
import { PrimaryButton } from "./primary-button";
import { useTabBarInset } from "./tab-bar";
import { T } from "./type";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Top bar height below the status bar: 6 top + 44 button + 8 bottom. */
const TOP_BAR = 58;

type ScreenProps = {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  /** Show a back button in a compact top bar (pushed screens). */
  back?: boolean;
  /** Close (x) instead of back chevron, for modal-style screens. */
  close?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Return the refetch promise so the pull spinner stops when it settles. */
  onRefresh?: () => unknown;
  footer?: React.ReactNode;
  /** Called when the user scrolls near the end of the content (infinite lists). */
  onEndReached?: () => void;
};

export function IconButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={active ? theme.ds.accent : theme.ds.ink} />
    </Pressable>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

export function Screen({
  title,
  eyebrow,
  subtitle,
  back,
  close,
  right,
  children,
  onRefresh,
  footer,
  onEndReached,
}: ScreenProps) {
  const { theme } = useUnistyles();
  const hasBar = back || close || !!right;
  // Android floating tab bar draws over the content; leave room so the last item clears it.
  const tabInset = useTabBarInset();
  // Re-tapping the active tab scrolls back to the top (no-op outside a tab navigator).
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const [scrolled, setScrolled] = useState(false);
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === "ios";
  const barHeight = insets.top + TOP_BAR;
  const [footerHeight, setFooterHeight] = useState(0);
  // Android blur samples this view; publish it while focused so the floating tab bar blurs it too.
  const blurTarget = useRef<View>(null);
  const { setTarget } = useBlurTarget();
  useFocusEffect(
    useCallback(() => {
      setTarget(blurTarget);
    }, [setTarget]),
  );
  const bottomPadding = footer
    ? Math.max(footerHeight - (ios ? insets.bottom : 0), 0) + 16
    : tabInset > 0
      ? tabInset + 16
      : undefined;
  // Only show the spinner for refreshes the user pulled. Driving iOS RefreshControl from background
  // refetches (`isRefetching`) leaves it stuck spinning when a tab mounts mid-refetch.
  const [pulling, setPulling] = useState(false);
  const handleRefresh = onRefresh
    ? async () => {
        setPulling(true);
        try {
          await onRefresh();
        } finally {
          setPulling(false);
        }
      }
    : undefined;
  return (
    <View style={styles.root}>
      <BlurTargetView ref={blurTarget} style={styles.root}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            !hasBar && styles.contentNoBar,
            hasBar && !ios ? { paddingTop: barHeight + 4 } : null,
            hasBar && ios ? styles.contentBarIos : null,
            bottomPadding != null ? { paddingBottom: bottomPadding } : null,
          ]}
          // iOS: let UIKit inset content for the status bar and the native (Liquid Glass) tab bar;
          // the extra top inset clears the absolute blurred top bar and keeps the refresh spinner below it.
          contentInsetAdjustmentBehavior={ios ? "automatic" : undefined}
          contentInset={hasBar && ios ? { top: TOP_BAR } : undefined}
          contentOffset={hasBar && ios ? { x: 0, y: -barHeight } : undefined}
          refreshControl={
            handleRefresh ? (
              <RefreshControl
                refreshing={pulling}
                onRefresh={handleRefresh}
                tintColor={theme.ds.inkTertiary}
                colors={[theme.ds.accent]}
                progressViewOffset={hasBar ? barHeight : insets.top}
              />
            ) : undefined
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={32}
          onScroll={
            hasBar || onEndReached
              ? (event) => {
                  const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                  if (hasBar) {
                    const next = contentOffset.y > (ios ? 4 - barHeight : 4);
                    if (next !== scrolled) setScrolled(next);
                  }
                  if (onEndReached && contentOffset.y + layoutMeasurement.height >= contentSize.height - 400) {
                    onEndReached();
                  }
                }
              : undefined
          }
          showsVerticalScrollIndicator={false}
        >
          {title ? (
            <View style={styles.header}>
              {eyebrow ? (
                <T variant="overline" tone="accent">
                  {eyebrow}
                </T>
              ) : null}
              <T variant="display" accessibilityRole="header">
                {title}
              </T>
              {subtitle ? (
                <T variant="callout" tone="secondary" style={styles.subtitle}>
                  {subtitle}
                </T>
              ) : null}
            </View>
          ) : null}
          {children}
        </ScrollView>
      </BlurTargetView>
      {hasBar ? (
        <BarBlur target={blurTarget} style={[styles.topBar, scrolled && styles.topBarScrolled]}>
          {back || close ? (
            <IconButton
              icon={close ? "close" : "chevron-back"}
              label={close ? "Close" : "Go back"}
              onPress={goBack}
            />
          ) : (
            <View />
          )}
          <View style={styles.topBarRight}>{right}</View>
        </BarBlur>
      ) : (
        <View style={styles.statusScrim} pointerEvents="none">
          <BarBlur target={blurTarget} style={styles.fill} />
        </View>
      )}
      {footer ? (
        <View
          style={styles.footerWrap}
          onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
        >
          <BarBlur target={blurTarget} style={[styles.footer, tabInset > 0 ? { paddingBottom: tabInset + 12 } : null]}>
            {footer}
          </BarBlur>
        </View>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

export function Section({
  title,
  caption,
  action,
  children,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.flex}>
          <T variant="title3" accessibilityRole="header">
            {title}
          </T>
          {caption ? (
            <T variant="footnote" tone="secondary" style={styles.sectionCaption}>
              {caption}
            </T>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

type PillTone = "neutral" | "accent" | "caution" | "positive";

export function Pill({
  label,
  tone = "neutral",
  icon,
  style,
}: {
  label: string;
  tone?: PillTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  pillStyles.useVariants({ tone });
  const color =
    tone === "accent"
      ? theme.ds.accent
      : tone === "caution"
        ? theme.ds.caution
        : tone === "positive"
          ? theme.ds.positive
          : theme.ds.inkSecondary;
  return (
    <View style={[pillStyles.pill, style]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : <View style={[pillStyles.dot, { backgroundColor: color }]} />}
      <T variant="caption" style={[pillStyles.label, { color }]}>
        {label}
      </T>
    </View>
  );
}

/** Pulsing placeholder block for loading states. */
export function Skeleton({ height, width = "100%", radius = 8 }: { height: number; width?: number | `${number}%`; radius?: number }) {
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.skeleton, { height, width, ...rounded(radius) }, animated]} />;
}

export function CardSkeleton() {
  return (
    <Card>
      <View style={styles.skeletonRow}>
        <Skeleton height={44} width={44} radius={12} />
        <View style={[styles.flex, styles.skeletonText]}>
          <Skeleton height={18} width="60%" />
          <Skeleton height={14} width="85%" />
        </View>
      </View>
      <Skeleton height={6} radius={3} />
      <Skeleton height={14} width="45%" />
    </Card>
  );
}

export function LoadingState({ label = "Loading", count = 3 }: { label?: string; count?: number }) {
  return (
    <View style={styles.loading} accessibilityLabel={label} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </View>
  );
}

export function MessageState({
  icon = "information-circle-outline",
  title,
  body,
  actionLabel,
  onAction,
  tone = "neutral",
}: {
  icon?: IconName;
  title: string;
  body?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "error";
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.message}>
      <View style={styles.messageArt}>
        <View style={[styles.messageBlob, styles.messageBlobA]} />
        <View style={[styles.messageBlob, styles.messageBlobB]} />
        <View style={[styles.messageIcon, tone === "error" && styles.messageIconError]}>
          <Ionicons name={icon} size={30} color={tone === "error" ? theme.ds.danger : theme.ds.onAccent} />
        </View>
      </View>
      <T variant="title3" align="center">
        {title}
      </T>
      {body ? (
        <T variant="callout" tone="secondary" align="center" style={styles.messageBody}>
          {body}
        </T>
      ) : null}
      {actionLabel && onAction ? (
        <PrimaryButton
          label={actionLabel}
          onPress={onAction}
          variant={tone === "error" ? "outline" : "solid"}
          size="md"
          style={styles.messageAction}
        />
      ) : null}
    </View>
  );
}

export function Notice({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "caution" | "error";
  icon?: IconName;
  children: React.ReactNode;
}) {
  const { theme } = useUnistyles();
  noticeStyles.useVariants({ tone });
  const color = tone === "info" ? theme.ds.inkSecondary : tone === "caution" ? theme.ds.caution : theme.ds.danger;
  const glyph = icon ?? (tone === "info" ? "information-circle-outline" : tone === "caution" ? "alert-circle-outline" : "close-circle-outline");
  return (
    <View style={noticeStyles.notice} accessibilityRole={tone === "error" ? "alert" : undefined}>
      <Ionicons name={glyph} size={18} color={color} style={noticeStyles.icon} />
      <View style={noticeStyles.body}>{children}</View>
    </View>
  );
}

/**
 * Disclosure section: a tappable header row that expands to reveal detail.
 * `summary` stays visible when collapsed so material information is never hidden.
 */
export function Collapsible({
  title,
  icon,
  tint = "accent",
  summary,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: IconName;
  tint?: "accent" | "tertiary" | "coral" | "mint" | "caution";
  summary?: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(defaultOpen);
  const fg = {
    accent: theme.ds.accent,
    tertiary: theme.ds.tertiary,
    coral: theme.ds.coral,
    mint: theme.ds.mint,
    caution: theme.ds.caution,
  }[tint];
  const bg = {
    accent: theme.ds.accentSoft,
    tertiary: theme.ds.tertiarySoft,
    coral: theme.ds.coralSoft,
    mint: theme.ds.mintSoft,
    caution: theme.ds.cautionSoft,
  }[tint];
  return (
    <View style={styles.collapsible}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        // No LayoutAnimation: on iOS it animates the body to a fixed frame and can clip long text.
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.rowPressed]}
      >
        <View style={[styles.collapsibleIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={18} color={fg} />
        </View>
        <View style={styles.flex}>
          <T variant="headline">
            {title}
            {count != null ? <T variant="headline" tone="tertiary">{`  ${count}`}</T> : null}
          </T>
          {/* Callers repeat the full text in the body, so once open the preview would only duplicate it. */}
          {summary && !open ? (
            <T variant="footnote" tone="secondary" numberOfLines={2}>
              {summary}
            </T>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={theme.ds.inkTertiary} />
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

/** Tappable settings-style row. */
export function ListRow({
  title,
  detail,
  value,
  icon,
  onPress,
  trailing,
  accessibilityLabel,
}: {
  title: string;
  detail?: string | null;
  value?: string | null;
  icon?: IconName;
  onPress?: () => void;
  trailing?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const { theme } = useUnistyles();
  const content = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={18} color={theme.ds.accent} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <T variant="callout" style={styles.rowTitle}>
          {title}
        </T>
        {detail ? (
          <T variant="footnote" tone="secondary" numberOfLines={2}>
            {detail}
          </T>
        ) : null}
      </View>
      {value ? (
        <T variant="callout" tone="secondary" numberOfLines={1} style={styles.rowValue}>
          {value}
        </T>
      ) : null}
      {trailing ??
        (onPress ? <Ionicons name="chevron-forward" size={16} color={theme.ds.inkTertiary} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.ds.canvas },
  // Keeps the clock/battery readable when content scrolls under the status bar.
  statusScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: rt.insets.top,
  },
  fill: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: rt.insets.top + 6,
    paddingHorizontal: theme.density.gutter,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarScrolled: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ds.line },
  topBarRight: { flexDirection: "row", gap: 8 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.surface,
    shadowColor: "#1B2250",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: { opacity: 0.7 },
  content: {
    paddingHorizontal: theme.density.gutter,
    paddingBottom: theme.spacing.xl,
    gap: theme.density.stack,
  },
  contentNoBar: { paddingTop: Platform.OS === "ios" ? 8 : rt.insets.top + 12 },
  contentBarIos: { paddingTop: 4 },
  header: { gap: 4, marginBottom: 4 },
  subtitle: { maxWidth: 520 },
  footerWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footer: {
    paddingHorizontal: theme.density.gutter,
    paddingTop: theme.density.rowY,
    paddingBottom: Math.max(rt.insets.bottom, 12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.ds.line,
    gap: 8,
  },
  card: {
    backgroundColor: theme.ds.surface,
    ...theme.rounded(24),
    gap: theme.density.rowGap,
    shadowColor: "#1B2250",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardPadded: { padding: theme.density.card },
  section: { gap: theme.density.sectionHeader, marginTop: theme.density.section - theme.density.stack },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", gap: theme.density.rowGap },
  sectionCaption: { marginTop: 2 },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ds.line },
  skeleton: { backgroundColor: theme.ds.sunken },
  skeletonRow: { flexDirection: "row", gap: theme.density.rowGap, alignItems: "center" },
  skeletonText: { gap: 8 },
  loading: { gap: theme.density.stack },
  message: {
    alignItems: "center",
    paddingVertical: theme.density.section,
    paddingHorizontal: theme.density.gutter,
    gap: 8,
  },
  messageArt: { width: 120, height: 96, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  messageBlob: { position: "absolute", borderRadius: 999 },
  messageBlobA: { width: 64, height: 64, backgroundColor: theme.ds.coralSoft, left: 6, top: 4 },
  messageBlobB: { width: 52, height: 52, backgroundColor: theme.ds.mintSoft, right: 8, bottom: 2 },
  messageIcon: {
    width: 64,
    height: 64,
    ...theme.rounded(22),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accent,
    transform: [{ rotate: "-6deg" }],
    shadowColor: theme.ds.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  messageIconError: { backgroundColor: theme.ds.dangerSoft, shadowOpacity: 0 },
  messageBody: { maxWidth: 320 },
  messageAction: { marginTop: theme.density.item, minWidth: 180 },
  collapsible: {
    backgroundColor: theme.ds.surface,
    ...theme.rounded(22),
    overflow: "hidden",
    shadowColor: "#1B2250",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.density.rowGap,
    paddingHorizontal: theme.density.card,
    paddingVertical: theme.density.rowY,
    minHeight: 56,
  },
  collapsibleIcon: { width: 36, height: 36, ...theme.rounded(12), alignItems: "center", justifyContent: "center" },
  collapsibleBody: { paddingHorizontal: theme.density.card, paddingBottom: theme.density.card, gap: theme.density.item },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.density.rowGap,
    paddingHorizontal: theme.density.card,
    paddingVertical: theme.density.rowY,
  },
  rowPressed: { backgroundColor: theme.ds.scrim },
  rowIcon: {
    width: 34,
    height: 34,
    ...theme.rounded(11),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ds.accentSoft,
  },
  rowTitle: { fontWeight: "500" },
  rowValue: { maxWidth: "55%" },
}));

const pillStyles = StyleSheet.create((theme) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: theme.density.pillX,
    paddingVertical: theme.density.pillY,
    borderRadius: theme.radius.full,
    variants: {
      tone: {
        neutral: { backgroundColor: theme.ds.sunken },
        accent: { backgroundColor: theme.ds.accentSoft },
        caution: { backgroundColor: theme.ds.cautionSoft },
        positive: { backgroundColor: theme.ds.accentSoft },
      },
    },
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontWeight: "600" },
}));

const noticeStyles = StyleSheet.create((theme) => ({
  notice: {
    flexDirection: "row",
    gap: theme.density.item,
    padding: theme.density.rowY,
    ...theme.rounded(16),
    variants: {
      tone: {
        info: { backgroundColor: theme.ds.sunken },
        caution: { backgroundColor: theme.ds.cautionSoft },
        error: { backgroundColor: theme.ds.dangerSoft },
      },
    },
  },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 6 },
}));
