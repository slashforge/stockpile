import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  LayoutAnimation,
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
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { rounded } from "@/config/sizing";
import { PrimaryButton } from "./primary-button";
import { T } from "./type";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

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
}: ScreenProps) {
  const { theme } = useUnistyles();
  const hasBar = back || close || !!right;
  const [scrolled, setScrolled] = useState(false);
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
      {hasBar ? (
        <View style={[styles.topBar, scrolled && styles.topBarScrolled]}>
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
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={[styles.content, !hasBar && styles.contentNoBar]}
        // iOS: let UIKit inset content for the status bar and the native (Liquid Glass) tab bar.
        contentInsetAdjustmentBehavior={Platform.OS === "ios" ? "automatic" : undefined}
        refreshControl={
          handleRefresh ? (
            <RefreshControl
              refreshing={pulling}
              onRefresh={handleRefresh}
              tintColor={theme.ds.inkTertiary}
              colors={[theme.ds.accent]}
            />
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={32}
        onScroll={
          hasBar
            ? (event) => {
                const next = event.nativeEvent.contentOffset.y > 4;
                if (next !== scrolled) setScrolled(next);
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
      {!hasBar ? <View style={styles.statusScrim} pointerEvents="none" /> : null}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
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

export function Pill({ label, tone = "neutral", icon }: { label: string; tone?: PillTone; icon?: IconName }) {
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
    <View style={pillStyles.pill}>
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
  tint?: "accent" | "lilac" | "coral" | "mint" | "caution";
  summary?: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(defaultOpen);
  const fg = {
    accent: theme.ds.accent,
    lilac: theme.ds.lilac,
    coral: theme.ds.coral,
    mint: theme.ds.mint,
    caution: theme.ds.caution,
  }[tint];
  const bg = {
    accent: theme.ds.accentSoft,
    lilac: theme.ds.lilacSoft,
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
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((value) => !value);
        }}
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
          {summary ? (
            <T variant="footnote" tone="secondary" numberOfLines={open ? undefined : 2}>
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
    backgroundColor: theme.ds.canvas,
    opacity: 0.94,
  },
  topBar: {
    paddingTop: rt.insets.top + 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.ds.canvas,
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
    paddingHorizontal: 20,
    paddingBottom: theme.spacing.xl,
    gap: 16,
  },
  contentNoBar: { paddingTop: Platform.OS === "ios" ? 12 : rt.insets.top + 16 },
  header: { gap: 4, marginBottom: 4 },
  subtitle: { maxWidth: 520 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Math.max(rt.insets.bottom, 12) + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.ds.line,
    backgroundColor: theme.ds.canvas,
    gap: 8,
  },
  card: {
    backgroundColor: theme.ds.surface,
    ...theme.rounded(24),
    gap: 12,
    shadowColor: "#1B2250",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardPadded: { padding: 18 },
  section: { gap: 12, marginTop: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  sectionCaption: { marginTop: 2 },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ds.line },
  skeleton: { backgroundColor: theme.ds.sunken },
  skeletonRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  skeletonText: { gap: 8 },
  loading: { gap: 14 },
  message: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 20,
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
  messageAction: { marginTop: 12, minWidth: 180 },
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
  collapsibleHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, minHeight: 64 },
  collapsibleIcon: { width: 36, height: 36, ...theme.rounded(12), alignItems: "center", justifyContent: "center" },
  collapsibleBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    gap: 10,
    padding: 14,
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
