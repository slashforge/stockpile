import { forwardRef, type InputHTMLAttributes } from "react";
import type { IconType } from "./layout";
import { cn, T } from "./type";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  icon?: IconType;
  error?: string | null;
  size?: "md" | "xl";
};

/** Labelled text field with the mobile look: soft surface, rounded, error line below. */
export const Field = forwardRef<HTMLInputElement, Props>(function Field(
  { label, icon: Icon, error, size = "md", className, id, ...props },
  ref,
) {
  const inputId = id ?? `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId}>
        <T as="span" variant="footnote" tone="secondary" className="font-semibold">
          {label}
        </T>
      </label>
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border bg-surface px-4 transition-colors focus-within:border-accent",
          error ? "border-danger" : "border-line-strong",
          size === "xl" ? "h-16" : "h-[52px]",
        )}
      >
        {Icon ? <Icon size={18} className="shrink-0 text-ink-3" /> : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3",
            size === "xl" ? "text-[28px] font-bold tracking-[6px] tabular-nums" : "t-body",
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <T variant="footnote" tone="danger" role="alert">
          {error}
        </T>
      ) : null}
    </div>
  );
});
