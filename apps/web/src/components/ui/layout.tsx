import { useRouter } from "@tanstack/react-router";
import { type ComponentType, type CSSProperties, type ReactNode, useState } from "react";
import {
  IoAlertCircleOutline,
  IoChevronBack,
  IoChevronDown,
  IoChevronForward,
  IoChevronUp,
  IoClose,
  IoCloseCircleOutline,
  IoInformationCircleOutline,
} from "react-icons/io5";
import { IconButton, PrimaryButton } from "./button";
import { cn, T } from "./type";

export type IconType = ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-3xl bg-surface shadow-card", padded && "p-4", className)}>{children}</div>
  );
}

export function Divider({ inset = 0, className }: { inset?: number; className?: string }) {
  return <div className={cn("h-px bg-line", className)} style={{ marginLeft: inset }} />;
}

export function Skeleton({
  height,
  width = "100%",
  radius = 8,
  className,
}: {
  height: number;
  width?: number | string;
  radius?: number;
  className?: string;
}) {
  return <div className={cn("skeleton shrink-0", className)} style={{ height, width, borderRadius: radius }} />;
}

export function CardSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <Skeleton height={44} width={44} radius={12} />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton height={18} width="60%" />
          <Skeleton height={14} width="85%" />
        </div>
      </div>
      <Skeleton height={6} radius={3} />
      <Skeleton height={14} width="45%" />
    </Card>
  );
}

export function LoadingState({ label = "Loading", count = 3 }: { label?: string; count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-label={label} role="progressbar">
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
}

export function MessageState({
  icon: Icon = IoInformationCircleOutline,
  title,
  body,
  actionLabel,
  onAction,
  tone = "neutral",
}: {
  icon?: IconType;
  title: string;
  body?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
      <div className="relative mb-2 flex h-24 w-[120px] items-center justify-center">
        <div className="absolute left-1.5 top-1 size-16 rounded-full bg-coral-soft" />
        <div className="absolute bottom-0.5 right-2 size-[52px] rounded-full bg-mint-soft" />
        <div
          className={cn(
            "relative flex size-16 -rotate-6 items-center justify-center rounded-[22px]",
            tone === "error"
              ? "bg-danger-soft text-danger"
              : "bg-accent text-on-accent shadow-[0_6px_12px_color-mix(in_srgb,var(--ds-accent)_30%,transparent)]",
          )}
        >
          <Icon size={30} />
        </div>
      </div>
      <T variant="title3" align="center">
        {title}
      </T>
      {body ? (
        <T variant="callout" tone="secondary" align="center" className="max-w-[320px]">
          {body}
        </T>
      ) : null}
      {actionLabel && onAction ? (
        <PrimaryButton
          label={actionLabel}
          onClick={onAction}
          variant={tone === "error" ? "outline" : "solid"}
          size="md"
          className="mt-2 min-w-[180px]"
        />
      ) : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "caution" | "error";
  icon?: IconType;
  children: ReactNode;
}) {
  const Icon = icon ?? (tone === "info" ? IoInformationCircleOutline : tone === "caution" ? IoAlertCircleOutline : IoCloseCircleOutline);
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex gap-2 rounded-2xl p-3",
        tone === "info" && "bg-sunken text-ink-2",
        tone === "caution" && "bg-caution-soft text-caution",
        tone === "error" && "bg-danger-soft text-danger",
      )}
    >
      <Icon size={18} className="mt-px shrink-0" />
      <div className="flex flex-1 flex-col gap-1.5">{children}</div>
    </div>
  );
}

type PillTone = "neutral" | "accent" | "caution" | "positive";

export function Pill({ label, tone = "neutral", icon: Icon, className }: { label: string; tone?: PillTone; icon?: IconType; className?: string }) {
  const fg = { neutral: "text-ink-2", accent: "text-accent", caution: "text-caution", positive: "text-positive" }[tone];
  const bg = { neutral: "bg-sunken", accent: "bg-accent-soft", caution: "bg-caution-soft", positive: "bg-accent-soft" }[tone];
  return (
    <span className={cn("inline-flex items-center gap-[5px] self-start rounded-full px-[9px] py-1", bg, fg, className)}>
      {Icon ? <Icon size={12} /> : <span className="size-1.5 rounded-full bg-current" />}
      <T as="span" variant="caption" tone="inherit" className="font-semibold">
        {label}
      </T>
    </span>
  );
}

const TINT = {
  accent: "bg-accent-soft text-accent",
  tertiary: "bg-tertiary-soft text-tertiary",
  coral: "bg-coral-soft text-coral",
  mint: "bg-mint-soft text-mint",
  caution: "bg-caution-soft text-caution",
};

/**
 * Disclosure section: a header row that expands to reveal detail.
 * `summary` stays visible when collapsed so material information is never hidden.
 */
export function Collapsible({
  title,
  icon: Icon,
  tint = "accent",
  summary,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: IconType;
  tint?: keyof typeof TINT;
  summary?: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-[22px] bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-14 w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-scrim"
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", TINT[tint])}>
          <Icon size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <T as="span" variant="headline">
            {title}
            {count != null ? (
              <T as="span" variant="headline" tone="tertiary">{`  ${count}`}</T>
            ) : null}
          </T>
          {summary && !open ? (
            <T as="span" variant="footnote" tone="secondary" lines={2}>
              {summary}
            </T>
          ) : null}
        </span>
        {open ? <IoChevronUp size={18} className="text-ink-3" /> : <IoChevronDown size={18} className="text-ink-3" />}
      </button>
      {open ? <div className="flex flex-col gap-2 px-4 pb-4">{children}</div> : null}
    </div>
  );
}

/** Settings-style row. */
export function ListRow({
  title,
  detail,
  value,
  icon: Icon,
  onClick,
  trailing,
}: {
  title: string;
  detail?: string | null;
  value?: string | null;
  icon?: IconType;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  const content = (
    <>
      {Icon ? (
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-accent-soft text-accent">
          <Icon size={18} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <T as="span" variant="callout" className="font-medium">
          {title}
        </T>
        {detail ? (
          <T as="span" variant="footnote" tone="secondary" lines={2}>
            {detail}
          </T>
        ) : null}
      </span>
      {value ? (
        <T as="span" variant="callout" tone="secondary" lines={1} className="max-w-[55%]">
          {value}
        </T>
      ) : null}
      {trailing ?? (onClick ? <IoChevronForward size={16} className="text-ink-3" /> : null)}
    </>
  );
  const cls = "flex min-h-[52px] w-full items-center gap-2.5 px-4 py-3";
  if (!onClick) return <div className={cls}>{content}</div>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:bg-scrim")}>
      {content}
    </button>
  );
}

export function useGoBack(fallback = "/") {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.history.back();
    else router.navigate({ to: fallback });
  };
}

/**
 * Page frame for every non-reel screen: optional sticky top bar (back/close + right actions),
 * large title, content column and an optional sticky footer for primary actions.
 */
export function Page({
  title,
  eyebrow,
  subtitle,
  back,
  close,
  right,
  footer,
  footerClassName,
  wide = false,
  children,
}: {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  back?: boolean;
  close?: boolean;
  right?: ReactNode;
  footer?: ReactNode;
  /** e.g. "lg:hidden" when large screens show the same actions in a side column. */
  footerClassName?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const goBack = useGoBack();
  const hasBar = back || close || !!right;
  const column = cn("mx-auto w-full px-4 md:px-8", wide ? "max-w-[1180px]" : "max-w-[760px]");
  return (
    <div className="flex min-h-dvh flex-col">
      {hasBar ? (
        <div className="sticky top-0 z-20 bg-canvas/80 backdrop-blur-xl">
          <div className={cn(column, "flex items-center justify-between py-2.5")}>
            {back || close ? (
              <IconButton label={close ? "Close" : "Go back"} onClick={goBack}>
                {close ? <IoClose size={20} /> : <IoChevronBack size={20} />}
              </IconButton>
            ) : (
              <span />
            )}
            <div className="flex gap-2">{right}</div>
          </div>
        </div>
      ) : null}
      <main className={cn(column, "flex flex-1 flex-col gap-3 pb-32 md:pb-12", hasBar ? "pt-1" : "pt-6 md:pt-10")}>
        {title ? (
          <header className="mb-1 flex flex-col gap-1">
            {eyebrow ? (
              <T variant="overline" tone="accent">
                {eyebrow}
              </T>
            ) : null}
            <T as="h1" variant="display">
              {title}
            </T>
            {subtitle ? (
              <T variant="callout" tone="secondary" className="max-w-[520px]">
                {subtitle}
              </T>
            ) : null}
          </header>
        ) : null}
        {children}
      </main>
      {footer ? (
        <div className={cn("sticky bottom-[84px] z-20 border-t border-line bg-canvas/85 backdrop-blur-xl md:bottom-0", footerClassName)}>
          <div className={cn(column, "flex flex-col gap-2 py-3")}>{footer}</div>
        </div>
      ) : null}
    </div>
  );
}

export function Section({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-2 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2.5">
        <T as="h2" className="shrink text-[20px] leading-[25px] font-semibold tracking-[-0.2px]">
          {title}
        </T>
        {typeof trailing === "string" ? (
          <T variant="caption" tone="tertiary" lines={1}>
            {trailing}
          </T>
        ) : (
          trailing
        )}
      </div>
      {children}
    </section>
  );
}
