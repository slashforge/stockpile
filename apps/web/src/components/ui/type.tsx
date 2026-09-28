import type { ComponentPropsWithoutRef, ElementType } from "react";

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
  | "onAccent"
  | "inherit";

const VARIANT: Record<TypeVariant, string> = {
  display: "t-display",
  title1: "t-title1",
  title2: "t-title2",
  title3: "t-title3",
  headline: "t-headline",
  body: "t-body",
  callout: "t-callout",
  subhead: "t-subhead",
  footnote: "t-footnote",
  caption: "t-caption",
  overline: "t-overline",
  numeric: "t-numeric",
};

const TONE: Record<TypeTone, string> = {
  primary: "text-ink",
  secondary: "text-ink-2",
  tertiary: "text-ink-3",
  accent: "text-accent",
  caution: "text-caution",
  danger: "text-danger",
  positive: "text-positive",
  onAccent: "text-on-accent",
  inherit: "",
};

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Props<E extends ElementType> = {
  as?: E;
  variant?: TypeVariant;
  tone?: TypeTone;
  align?: "left" | "center" | "right";
  /** Clamp to N lines with an ellipsis. */
  lines?: number;
} & Omit<ComponentPropsWithoutRef<E>, "as">;

/** Stockpile type scale: friendly platform sans (SF Pro / system) throughout. */
export function T<E extends ElementType = "p">({
  as,
  variant = "body",
  tone = "primary",
  align,
  lines,
  className,
  style,
  ...props
}: Props<E>) {
  const Component = (as ?? "p") as ElementType;
  const clamp =
    lines === 1
      ? "truncate"
      : lines
        ? "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical]"
        : "";
  return (
    <Component
      {...props}
      className={cn(
        VARIANT[variant],
        TONE[tone],
        align === "center" ? "text-center" : align === "right" ? "text-right" : "",
        clamp,
        className,
      )}
      style={lines && lines > 1 ? { WebkitLineClamp: lines, ...style } : style}
    />
  );
}
