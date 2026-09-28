import type { ReactNode } from "react";
import { IoAlbums, IoBagHandle, IoCard, IoFlash, IoHardwareChip, IoLayers, IoMedkit } from "react-icons/io5";
import type { IconType } from "@/components/ui/layout";
import { GRADIENT_CLASS, type GradientName } from "@/components/ui/theme";
import { cn } from "@/components/ui/type";
import type { Bag } from "@/services/api/types";
import { TokenAvatar } from "./token-avatar";

// Decorative theme cue derived from the bag's own title/subtitle words.
const THEMES: { pattern: RegExp; icon: IconType; gradient: GradientName }[] = [
  { pattern: /\b(ai|compute|chip|semi|hardware|infrastructure)\b/i, icon: IoHardwareChip, gradient: "blue" },
  { pattern: /\b(consumer|commerce|retail|shopping|entertainment)\b/i, icon: IoBagHandle, gradient: "coral" },
  { pattern: /\b(energy|power|utilit|grid|solar)\b/i, icon: IoFlash, gradient: "mint" },
  { pattern: /\b(health|bio|pharma|medic)\b/i, icon: IoMedkit, gradient: "rose" },
  { pattern: /\b(financ|bank|payment|fintech)\b/i, icon: IoCard, gradient: "sky" },
  { pattern: /\b(megacap|platform|builder|software|cloud|computing)\b/i, icon: IoLayers, gradient: "rose" },
];
const FALLBACK: GradientName[] = ["blue", "mint", "coral", "rose", "sky"];

export function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function bagTheme(bag: Pick<Bag, "id" | "title" | "subtitle">): { icon: IconType; gradient: GradientName } {
  const text = `${bag.title} ${bag.subtitle}`;
  const match = THEMES.find(({ pattern }) => pattern.test(text));
  return match ?? { icon: IoAlbums, gradient: FALLBACK[hashString(bag.id) % FALLBACK.length]! };
}

/** Abstract, deterministic shapes so every bag has its own motif (viewBox scales to the panel). */
function Motif({ seed }: { seed: number }) {
  const w = 400;
  const h = 232;
  const r1 = h * (0.55 + (seed % 5) * 0.06);
  const r2 = h * (0.3 + (seed % 3) * 0.08);
  const wave = h * (0.62 + (seed % 4) * 0.05);
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <circle cx={w * 0.92} cy={h * 0.1} r={r1} fill="#FFFFFF" fillOpacity={0.14} />
      <circle cx={w * 0.08} cy={h * 0.95} r={r2} fill="#FFFFFF" fillOpacity={0.12} />
      <path
        d={`M0 ${wave} C ${w * 0.3} ${wave - h * 0.28}, ${w * 0.6} ${wave + h * 0.24}, ${w} ${wave - h * 0.1} L ${w} ${h} L 0 ${h} Z`}
        fill="#FFFFFF"
        fillOpacity={0.1}
      />
      <circle cx={w * 0.62} cy={h * 0.2} r={3} fill="#FFFFFF" fillOpacity={0.6} />
      <circle cx={w * 0.7} cy={h * 0.3} r={2} fill="#FFFFFF" fillOpacity={0.5} />
      <circle cx={w * 0.18} cy={h * 0.25} r={2.5} fill="#FFFFFF" fillOpacity={0.45} />
    </svg>
  );
}

/** Overlapping cluster of real token logos (monogram fallback) with white rings. */
export function LogoCluster({
  assets,
  size = 56,
  limit = 4,
  flat = false,
}: {
  assets: { symbol: string; iconUrl: string | null | undefined; mint?: string | null }[];
  size?: number;
  /** Total slots including the "+N" badge. */
  limit?: number;
  /** No drop shadow: for small clusters sitting on flat canvas (headers, list rows). */
  flat?: boolean;
}) {
  const shown = assets.length > limit ? assets.slice(0, Math.max(1, limit - 1)) : assets;
  const rest = assets.length - shown.length;
  const overlap = size * 0.28;
  const ring = Math.min(3, Math.max(1.5, size * 0.1));
  const shadow = flat ? undefined : `0 ${Math.max(1, size * 0.07)}px ${Math.max(3, size * 0.15)}px rgba(16,19,31,0.18)`;
  return (
    <span className="inline-flex items-center" aria-hidden>
      {shown.map((asset, index) => (
        <span
          key={`${asset.symbol}-${index}`}
          className="relative inline-flex rounded-full bg-white"
          style={{
            marginLeft: index === 0 ? 0 : -overlap,
            zIndex: shown.length - index,
            border: `${ring}px solid #FFFFFF`,
            boxShadow: shadow,
          }}
        >
          <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} mint={asset.mint} size={size} />
        </span>
      ))}
      {rest > 0 ? (
        <span
          className="relative inline-flex items-center justify-center rounded-full bg-[#E9EDFF] font-extrabold text-[#2563EB]"
          style={{
            marginLeft: -overlap,
            width: size + ring * 2,
            height: size + ring * 2,
            border: `${ring}px solid #FFFFFF`,
            boxShadow: shadow,
            fontSize: Math.max(11, size * 0.3),
          }}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/** Gradient artwork panel for a bag: abstract motif + oversized logo cluster. */
export function BagArt({
  bag,
  height = 150,
  logoSize = 56,
  showThemeIcon = true,
  logosOnTop = false,
  className,
  children,
}: {
  bag: Bag;
  height?: number;
  logoSize?: number;
  showThemeIcon?: boolean;
  /** Logos sit at the top-left and `children` (e.g. a title overlay) at the bottom, over a soft scrim. */
  logosOnTop?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { icon: Icon, gradient } = bagTheme(bag);
  return (
    <div
      className={cn("relative flex flex-col justify-end overflow-hidden", GRADIENT_CLASS[gradient], className)}
      style={logosOnTop ? { minHeight: height, paddingTop: 18 + logoSize + 16 } : { height }}
    >
      <Motif seed={hashString(bag.id)} />
      {showThemeIcon ? (
        <span className="absolute left-3.5 top-3.5 flex size-8 items-center justify-center rounded-full bg-white/22 text-white" aria-hidden>
          <Icon size={16} />
        </span>
      ) : null}
      {logosOnTop ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(16,19,31,0)_35%,rgba(16,19,31,0.28)_100%)]" />
      ) : null}
      <div className={logosOnTop ? "absolute left-[18px] top-[18px]" : "relative px-[18px] pb-4"}>
        <LogoCluster assets={bag.assets} size={logoSize} />
      </div>
      {children}
    </div>
  );
}
