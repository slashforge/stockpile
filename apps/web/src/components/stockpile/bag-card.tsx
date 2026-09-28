import { Link } from "@tanstack/react-router";
import { IoBookOutline, IoFlash, IoHourglassOutline } from "react-icons/io5";
import { cn, T } from "@/components/ui/type";
import { bagCurator } from "@/lib/market";
import { isPreIpoBag } from "@/lib/pre-ipo";
import type { BagReturnEntry } from "@/services/api/returns";
import type { Bag } from "@/services/api/types";
import { BagArt } from "./bag-art";
import { BagReturnsLine, CuratorLine } from "./market";
import { SaveButton } from "./save-button";

/** Open to buy only when the server says so AND every asset has a verified mint. */
export function bagTradable(bag: Bag) {
  return bag.tradable && bag.assets.length > 0 && bag.assets.every((asset) => !!asset.mint);
}

/** Why a bag is research-only: the server's reason when given, else the mint check. */
export function researchOnlyReason(bag: Bag): string {
  if (bag.tradableReason) return bag.tradableReason;
  const unverified = bag.assets.filter((asset) => !asset.mint).length;
  if (unverified === 0) return "Research only for now";
  return unverified === bag.assets.length
    ? "Research only until token mints are verified"
    : `${unverified} of ${bag.assets.length} token mints still unverified`;
}

/** Small "Pre-IPO" marker for bags holding PreStocks tokens. */
export function PreIpoChip({ onArt = false }: { onArt?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-[7px] py-0.5",
        onArt ? "bg-white/24 text-white" : "bg-tertiary-soft text-tertiary",
      )}
    >
      <IoHourglassOutline size={11} />
      <T as="span" variant="caption" tone="inherit" className="font-bold">
        Pre-IPO
      </T>
    </span>
  );
}

export function TradeStatus({ bag, onArt = false }: { bag: Bag; onArt?: boolean }) {
  const tradable = bagTradable(bag);
  const Icon = tradable ? IoFlash : IoBookOutline;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-[3px]",
          onArt ? "bg-white/24 text-white" : tradable ? "bg-mint-soft text-positive" : "bg-sunken text-ink-2",
        )}
      >
        <Icon size={12} />
        <T as="span" variant="caption" tone="inherit" className="font-bold">
          {tradable ? "Open to buy" : "Research only"}
        </T>
      </span>
      {isPreIpoBag(bag) ? <PreIpoChip onArt={onArt} /> : null}
    </span>
  );
}

/** Full-bleed bag tile: gradient artwork with real token logos, title and status overlaid. */
export function BagCard({
  bag,
  compact = false,
  returns,
  returnsLoading = false,
}: {
  bag: Bag;
  compact?: boolean;
  returns?: BagReturnEntry | null;
  returnsLoading?: boolean;
}) {
  const tokenCount = `${bag.assets.length} ${bag.assets.length === 1 ? "token" : "tokens"}`;
  return (
    <Link
      to="/bag/$id"
      params={{ id: bag.id }}
      aria-label={`${bag.title}. ${bag.subtitle}. ${tokenCount}`}
      className="group block overflow-hidden rounded-[28px] shadow-[0_10px_20px_rgba(27,34,80,0.12)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(27,34,80,0.16)] active:scale-[0.985]"
    >
      <BagArt bag={bag} height={compact ? 172 : 232} logoSize={compact ? 46 : 60} showThemeIcon={false} logosOnTop>
        <div className="absolute right-2.5 top-2.5">
          <SaveButton bagId={bag.id} title={bag.title} variant="glass" />
        </div>
        <div className="relative flex flex-col gap-0.5 px-4 pb-3">
          <T variant={compact ? "title2" : "title1"} lines={1} tone="inherit" className="text-white">
            {bag.title}
          </T>
          <T variant="footnote" lines={1} tone="inherit" className="text-white/90">
            {bag.subtitle}
          </T>
          <CuratorLine curator={bagCurator(bag)} onArt />
          <div className="mt-1.5">
            <BagReturnsLine entry={returns} loading={returnsLoading} onArt />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <TradeStatus bag={bag} onArt />
            <T as="span" variant="caption" tone="inherit" className="font-semibold text-white/90">
              {tokenCount}
            </T>
          </div>
        </div>
      </BagArt>
    </Link>
  );
}
