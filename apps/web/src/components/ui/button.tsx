import type { ComponentType, ReactNode } from "react";
import { cn, T } from "./type";

type IconType = ComponentType<{ size?: number; className?: string }>;

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="progressbar"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type ButtonProps = {
  label: string;
  onClick?: () => void;
  /** solid = primary action, outline = secondary, ghost = low emphasis text action. */
  variant?: "solid" | "outline" | "ghost" | "light" | "danger";
  size?: "lg" | "md";
  icon?: IconType;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
};

export function PrimaryButton({
  label,
  onClick,
  variant = "solid",
  size = "lg",
  icon: Icon,
  disabled,
  loading,
  className,
  type = "button",
  title,
}: ButtonProps) {
  const inactive = disabled || loading;
  // Disabled solid buttons read as "not available" rather than a faded primary action.
  const mutedSolid = variant === "solid" && disabled && !loading;
  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-full select-none transition-[transform,opacity,background-color] duration-150 active:scale-[0.985]";
  const sizes = size === "lg" ? "min-h-[54px] px-6" : "min-h-[44px] px-4";
  const variants = mutedSolid
    ? "bg-sunken text-ink-3"
    : {
        solid: "bg-accent text-on-accent shadow-[0_6px_12px_color-mix(in_srgb,var(--ds-accent)_28%,transparent)] hover:bg-accent-pressed",
        outline: "bg-surface text-ink border border-line-strong hover:bg-sunken",
        ghost: "text-accent hover:bg-accent-soft",
        light: "bg-white text-[#2563EB] hover:bg-white/90",
        danger: "bg-danger text-white hover:opacity-90",
      }[variant];
  return (
    <button
      type={type}
      title={title}
      aria-busy={loading || undefined}
      disabled={inactive}
      onClick={onClick}
      className={cn(base, sizes, variants, inactive && !mutedSolid && "opacity-45", className)}
    >
      {loading ? (
        <Spinner />
      ) : (
        <>
          {Icon ? <Icon size={size === "lg" ? 18 : 16} /> : null}
          <T as="span" variant={size === "lg" ? "headline" : "subhead"} tone="inherit" className="font-semibold">
            {label}
          </T>
        </>
      )}
    </button>
  );
}

/** Round 44px surface button with a soft shadow (top bars, save, close). */
export function IconButton({
  label,
  onClick,
  children,
  className,
  variant = "surface",
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  variant?: "surface" | "sunken" | "glass";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-60",
        variant === "surface" && "bg-surface text-ink shadow-[0_2px_8px_rgba(27,34,80,0.08)]",
        variant === "sunken" && "size-9 bg-sunken text-ink-2",
        variant === "glass" && "bg-white/25 text-white backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </button>
  );
}
