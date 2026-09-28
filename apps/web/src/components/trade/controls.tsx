import { IoBackspaceOutline, IoSettingsOutline, IoWarning } from "react-icons/io5";
import { cn, T } from "@/components/ui/type";
import type { AmountKey } from "@/lib/trade/amount-input";
import type { ImpactLevel } from "@/lib/trade/legs";
import { formatBps } from "@/utils/amounts";

/** `null` = automatic: Jupiter picks the limit per swap from live market conditions. */
export const SLIPPAGE_OPTIONS: { bps: number | null; label: string }[] = [
  { bps: null, label: "Auto" },
  { bps: 50, label: "0.5%" },
  { bps: 100, label: "1%" },
  { bps: 300, label: "3%" },
];

export function protectionLabel(bps: number | null) {
  return bps == null ? "Auto" : formatBps(bps);
}

export function Chip({
  label,
  selected,
  onClick,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-full border font-semibold transition-colors",
        compact ? "t-footnote min-h-8 min-w-[52px] px-3" : "t-subhead min-h-11 min-w-16 px-3.5",
        selected ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface text-ink hover:bg-sunken",
      )}
    >
      {label}
    </button>
  );
}

/** Header cog + popover for price protection; a dot marks a non-default setting. */
export function TradeSettings({
  value,
  open,
  onToggle,
  onChange,
  onClose,
}: {
  value: number | null;
  open: boolean;
  onToggle: () => void;
  onChange: (bps: number | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Trade settings. Price protection ${protectionLabel(value)}`}
        aria-expanded={open}
        onClick={onToggle}
        className="relative flex size-9 items-center justify-center rounded-full bg-sunken text-ink-2 transition-opacity hover:opacity-80"
      >
        <IoSettingsOutline size={19} />
        {value != null ? <span className="absolute right-[7px] top-[7px] size-[7px] rounded-full bg-accent" /> : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
          <div className="animate-fade absolute right-0 top-11 z-40 flex w-[280px] flex-col gap-2 rounded-2xl bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
            <T variant="subhead">Price protection</T>
            <T variant="footnote" tone="secondary">
              The most the price can move on each swap before it’s cancelled. Auto adapts to the market.
            </T>
            <div className="mt-1 flex gap-1.5">
              {SLIPPAGE_OPTIONS.map((option) => (
                <Chip
                  key={option.label}
                  compact
                  label={option.label}
                  selected={value === option.bps}
                  onClick={() => {
                    onChange(option.bps);
                    onClose();
                  }}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// Fixed steps: the hero amount shrinks as it grows so it never clips.
export function heroSize(text: string) {
  if (text.length <= 6) return "text-[72px] leading-[84px] tracking-[-2.5px]";
  if (text.length <= 9) return "text-[56px] leading-[68px] tracking-[-2px]";
  return "text-[42px] leading-[52px] tracking-[-1.2px]";
}

/** Compact price-impact warning; renders nothing for healthy routes. */
export function ImpactLabel({ level, impact }: { level: ImpactLevel; impact: number | null }) {
  if (impact == null || (level !== "warn" && level !== "high")) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-[3px]", level === "high" ? "text-danger" : "text-caution")}
      aria-label={`${level === "high" ? "Very high" : "High"} price impact, ${impact.toFixed(2)} percent. Thin liquidity.`}
    >
      <IoWarning size={11} />
      <T as="span" variant="caption" tone="inherit" className="font-semibold">
        {impact.toFixed(2)}% impact
      </T>
    </span>
  );
}

const ROWS: (Exclude<AmountKey, "delete"> | "delete")[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "delete"],
];

/** In-app decimal keypad (the amount screen also accepts typed digits). */
export function Numpad({ onKey, onClear }: { onKey: (key: AmountKey) => void; onClear?: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {ROWS.flat().map((key) => (
        <button
          key={key}
          type="button"
          aria-label={key === "delete" ? "Delete" : key === "." ? "Decimal point" : key}
          onClick={() => onKey(key)}
          onDoubleClick={key === "delete" ? onClear : undefined}
          className="flex h-14 items-center justify-center rounded-[18px] text-ink transition-colors hover:bg-sunken active:bg-sunken"
        >
          {key === "delete" ? <IoBackspaceOutline size={26} /> : <span className="t-title1 font-semibold tracking-normal">{key}</span>}
        </button>
      ))}
    </div>
  );
}
