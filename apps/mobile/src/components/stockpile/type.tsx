import { Text as RNText, type TextProps } from "react-native";
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
