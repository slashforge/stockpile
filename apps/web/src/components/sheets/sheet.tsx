import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { IoClose } from "react-icons/io5";
import { cn } from "@/components/ui/type";

/**
 * Modal surface: a bottom sheet on small screens (like the native sheets on mobile) and a centered
 * card on larger screens. Escape and backdrop clicks dismiss it.
 */
export function Sheet({
  open,
  onClose,
  children,
  label,
  className,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="animate-fade absolute inset-0 bg-[rgba(9,11,20,0.45)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "animate-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-canvas shadow-float outline-none md:rounded-[28px]",
          size === "sm" && "md:max-w-[420px]",
          size === "md" && "md:max-w-[480px]",
          size === "lg" && "md:max-w-[560px]",
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-sunken text-ink-2 transition-opacity hover:opacity-80"
        >
          <IoClose size={20} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
