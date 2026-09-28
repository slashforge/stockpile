import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { IoChevronForward } from "react-icons/io5";
import { Spinner } from "@/components/ui/button";
import { cn } from "@/components/ui/type";

const TRACK = 58;
const INSET = 4;
const KNOB = TRACK - INSET * 2;
/** Fraction of the travel the knob must pass before the action fires. */
const COMMIT_AT = 0.88;

/**
 * Drag-to-confirm for irreversible actions. The knob has to travel almost the full track before the
 * action fires, so a stray click does nothing. Keyboard: arrow right moves it, reaching the end commits.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  tone = "accent",
  disabled,
  loading,
  resetKey,
  hint,
}: {
  label: string;
  onConfirm: () => void;
  tone?: "accent" | "danger";
  disabled?: boolean;
  loading?: boolean;
  resetKey?: unknown;
  hint?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ pointer: number; x: number } | null>(null);
  const inactive = disabled || loading;
  const travel = () => Math.max((track.current?.clientWidth ?? 0) - KNOB - INSET * 2, 1);

  useEffect(() => {
    setX(0);
  }, [resetKey]);

  const commit = () => {
    setX(travel());
    onConfirm();
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (inactive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { pointer: event.clientX, x };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!start.current) return;
    setX(Math.min(Math.max(start.current.x + event.clientX - start.current.pointer, 0), travel()));
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (x >= travel() * COMMIT_AT) commit();
    else setX(0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (inactive) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = Math.min(x + travel() / 5, travel());
      if (next >= travel() * COMMIT_AT) commit();
      else setX(next);
    } else if (event.key === "ArrowLeft" || event.key === "Escape") {
      setX(0);
    }
  };

  const max = track.current ? travel() : 1;
  const progress = Math.min(x / max, 1);
  return (
    <div
      ref={track}
      className={cn(
        "relative flex items-center overflow-hidden rounded-full select-none",
        inactive && !loading
          ? "bg-sunken"
          : tone === "danger"
            ? "bg-danger shadow-[0_6px_12px_color-mix(in_srgb,var(--ds-danger)_24%,transparent)]"
            : "bg-accent shadow-[0_6px_12px_color-mix(in_srgb,var(--ds-accent)_28%,transparent)]",
      )}
      style={{ height: TRACK }}
    >
      {!inactive ? (
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full bg-white/16", !dragging && "transition-[width] duration-200")}
          style={{ width: x + KNOB + INSET * 2 }}
        />
      ) : null}
      <div
        className={cn("pointer-events-none absolute flex items-center justify-center", !dragging && "transition-all duration-200")}
        style={{
          left: KNOB + INSET * 2,
          right: KNOB + INSET * 2,
          opacity: Math.max(0, 1 - progress / 0.55),
          transform: `translateX(${progress * 24}px)`,
        }}
      >
        {loading ? (
          <Spinner className="text-on-accent" />
        ) : (
          <span className={cn("t-headline truncate", inactive ? "text-ink-3" : tone === "danger" ? "text-white" : "text-on-accent")}>
            {label}
          </span>
        )}
      </div>
      {!loading ? (
        <button
          type="button"
          role="slider"
          aria-label={label}
          title={hint ?? "Drag right, or press the right arrow key, to confirm"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-disabled={inactive || undefined}
          disabled={inactive}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute flex touch-none items-center justify-center rounded-full bg-surface",
            !inactive && "cursor-grab shadow-[0_2px_6px_rgba(0,0,0,0.16)] active:cursor-grabbing",
            !dragging && "transition-transform duration-200",
            inactive ? "text-ink-3" : tone === "danger" ? "text-danger" : "text-accent",
          )}
          style={{
            left: INSET,
            width: KNOB,
            height: KNOB,
            transform: `translateX(${x}px) scale(${dragging ? 1.04 : 1})`,
          }}
        >
          <IoChevronForward size={22} />
        </button>
      ) : null}
    </div>
  );
}
