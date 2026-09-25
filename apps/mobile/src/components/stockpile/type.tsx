import { useRef, useState } from "react";
import {
  Platform,
  Text as RNText,
  type StyleProp,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type TypeVariant =
  | "display"
  | "title1"
  | "title2"
  | "title3"
  | "headline"
  | "body"
  | "callout"
  | "subhead"
  | "footnote"
  | "caption"
  | "overline"
  | "numeric";

export type TypeTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "accent"
  | "caution"
  | "danger"
  | "positive"
  | "onAccent";

type Props = TextProps & {
  variant?: TypeVariant;
  tone?: TypeTone;
  align?: "left" | "center" | "right";
};

/** Stockpile type scale: friendly platform sans (SF Pro / Roboto) throughout. */
export function T({ variant = "body", tone = "primary", align, style, ...props }: Props) {
  styles.useVariants({ variant, tone });
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...props}
      style={[styles.text, align ? { textAlign: align } : null, style]}
    />
  );
}

/**
 * Long paragraph that must never clip. On iOS (Fabric) the text frame can be pixel-snapped a hair
 * shorter than the measured text (e.g. 230.9998 for 11 lines of 21), so the drawn layout fits one
 * line fewer and crams the overflow onto its last line, which is cut off. `onTextLayout` reports
 * that drawn layout: when it has fewer lines than the frame holds, add a little slack so the last
 * line fits. `containerStyle` sizes the wrapper (e.g. `flex: 1` inside a row).
 */
export function FullText({
  containerStyle,
  onTextLayout,
  ...props
}: Props & { containerStyle?: StyleProp<ViewStyle> }) {
  const [minHeight, setMinHeight] = useState(0);
  const frameHeight = useRef(0);
  const drawn = useRef<{ count: number; lineHeight: number } | null>(null);
  if (Platform.OS !== "ios") {
    return <T {...props} onTextLayout={onTextLayout} style={[containerStyle as TextStyle, props.style]} />;
  }
  // Either event can arrive first, so both re-check.
  const check = () => {
    const lines = drawn.current;
    const height = frameHeight.current;
    if (!lines || height <= 0 || minHeight > 0) return;
    if (lines.count * lines.lineHeight < height - lines.lineHeight / 2) {
      setMinHeight(Math.ceil(height) + 2);
    }
  };
  return (
    <View style={containerStyle}>
      <T
        {...props}
        numberOfLines={0}
        style={[props.style, minHeight > 0 ? { minHeight } : null]}
        onLayout={(event) => {
          frameHeight.current = event.nativeEvent.layout.height;
          check();
        }}
        onTextLayout={(event) => {
          onTextLayout?.(event);
          const lines = event.nativeEvent.lines;
          drawn.current = lines.length
            ? { count: lines.length, lineHeight: lines[0].height }
            : null;
          check();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  text: {
    fontFamily: theme.fonts.sans,
    variants: {
      variant: {
        display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8 },
        title1: { fontSize: 28, lineHeight: 33, fontWeight: "800", letterSpacing: -0.5 },
        title2: { fontSize: 21, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
        title3: { fontSize: 18, lineHeight: 23, fontWeight: "700", letterSpacing: -0.2 },
        headline: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
        body: { fontSize: 16, lineHeight: 23 },
        callout: { fontSize: 15, lineHeight: 21 },
        subhead: { fontSize: 14, lineHeight: 19, fontWeight: "600" },
        footnote: { fontSize: 13, lineHeight: 18 },
        caption: { fontSize: 12, lineHeight: 16 },
        overline: {
          fontSize: 12,
          lineHeight: 16,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        },
        numeric: { fontSize: 15, lineHeight: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
      },
      tone: {
        primary: { color: theme.ds.ink },
        secondary: { color: theme.ds.inkSecondary },
        tertiary: { color: theme.ds.inkTertiary },
        accent: { color: theme.ds.accent },
        caution: { color: theme.ds.caution },
        danger: { color: theme.ds.danger },
        positive: { color: theme.ds.positive },
        onAccent: { color: theme.ds.onAccent },
      },
    },
  },
}));
