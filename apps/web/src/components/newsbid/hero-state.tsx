import type { ReactNode } from "react";
import { PrimaryButton } from "@/components/ui/button";
import type { IconType } from "@/components/ui/layout";
import { GRADIENT_CLASS, type GradientName } from "@/components/ui/theme";
import { cn, T } from "@/components/ui/type";
import type { BagAsset } from "@/services/api/types";
import { LogoCluster } from "./bag-art";

const ACCENT_POSITIONS = [
  "-top-[18px] -right-[30px] rotate-[10deg] bg-mint",
  "-bottom-[14px] -left-[34px] -rotate-[12deg] bg-coral",
  "-bottom-5 -right-[22px] rotate-6 bg-sun",
];

/**
 * Illustrated state for empty, signed-out and unavailable screens: a gradient panel with floating
 * icon tiles (or real token logos), a short title, one line of context and a single clear action.
 */
export function HeroState({
  gradient = "blue",
  icon: Icon,
  accents = [],
  logos,
  title,
  body,
  actionLabel,
  actionIcon,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
}: {
  gradient?: GradientName;
  icon: IconType;
  accents?: IconType[];
  logos?: BagAsset[];
  title: string;
  body?: ReactNode;
  actionLabel?: string;
  actionIcon?: IconType;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-[32px]",
          GRADIENT_CLASS[gradient],
          compact ? "h-44" : "h-[220px]",
        )}
      >
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <circle cx={92} cy={6} r={30} fill="#FFFFFF" fillOpacity={0.14} />
          <circle cx={6} cy={66} r={22} fill="#FFFFFF" fillOpacity={0.12} />
          <circle cx={30} cy={14} r={1.2} fill="#FFFFFF" fillOpacity={0.7} />
          <circle cx={74} cy={52} r={1} fill="#FFFFFF" fillOpacity={0.6} />
        </svg>
        <div className="relative" aria-hidden>
          {logos && logos.length > 0 ? (
            <LogoCluster assets={logos} size={compact ? 52 : 64} limit={4} />
          ) : (
            <div className="relative">
              <div className="flex size-[84px] -rotate-6 items-center justify-center rounded-[28px] bg-white text-[#2563EB] shadow-[0_8px_16px_rgba(16,19,31,0.18)]">
                <Icon size={compact ? 30 : 36} />
              </div>
              {accents.slice(0, 3).map((Accent, index) => (
                <div
                  key={index}
                  className={cn(
                    "absolute flex size-10 items-center justify-center rounded-[14px] border-[3px] border-white/90 text-white",
                    ACCENT_POSITIONS[index],
                  )}
                >
                  <Accent size={16} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 px-3">
        <T as="h2" variant="title2" align="center">
          {title}
        </T>
        {body ? (
          <T variant="callout" tone="secondary" align="center" className="mx-auto max-w-[360px]">
            {body}
          </T>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} icon={actionIcon} onClick={onAction} className="mx-auto mt-0.5 w-full max-w-[420px]" />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <PrimaryButton label={secondaryLabel} onClick={onSecondary} variant="ghost" size="md" className="mx-auto" />
      ) : null}
    </div>
  );
}

/** Rounded gradient surface for hero cards (wallet, profile); optional soft decorative circles. */
export function GradientCard({
  gradient = "blue",
  decorated = true,
  children,
  className,
}: {
  gradient?: GradientName;
  decorated?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-col gap-3 overflow-hidden rounded-3xl p-5", GRADIENT_CLASS[gradient], className)}>
      {decorated ? (
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 60" preserveAspectRatio="xMaxYMin slice" aria-hidden>
          <circle cx={96} cy={4} r={26} fill="#FFFFFF" fillOpacity={0.14} />
          <circle cx={72} cy={62} r={16} fill="#FFFFFF" fillOpacity={0.1} />
        </svg>
      ) : null}
      <div className="relative flex flex-col gap-3">{children}</div>
    </div>
  );
}
