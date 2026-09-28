import type { MouseEvent } from "react";
import { IoBookmark, IoBookmarkOutline } from "react-icons/io5";
import { toast } from "sonner";
import { useSignInSheet } from "@/components/sheets/sign-in-sheet";
import { cn } from "@/components/ui/type";
import { useSavedBagIds, useToggleSaved } from "@/hooks/use-account";
import { useStockpileAuth } from "@/providers/auth-context";

/** Bookmark toggle. Signed-out users are sent to sign in; browse-only builds hide it. */
export function SaveButton({
  bagId,
  title,
  variant = "plain",
}: {
  bagId: string;
  title: string;
  variant?: "plain" | "circle" | "glass";
}) {
  const { configured, authenticated } = useStockpileAuth();
  const saved = useSavedBagIds();
  const toggle = useToggleSaved();
  const { requestSignIn } = useSignInSheet();
  if (!configured) return null;
  const isSaved = !!saved.data?.includes(bagId);

  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!authenticated) {
      requestSignIn();
      return;
    }
    toggle.mutate(
      { bagId, saved: isSaved },
      {
        onSuccess: () => toast.success(isSaved ? "Removed" : "Saved"),
        onError: () => toast.error(isSaved ? "Not removed" : "Not saved"),
      },
    );
  };

  const Icon = isSaved ? IoBookmark : IoBookmarkOutline;
  return (
    <button
      type="button"
      aria-label={isSaved ? `Remove ${title} from saved` : `Save ${title}`}
      aria-pressed={isSaved}
      disabled={toggle.isPending}
      onClick={onClick}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-60",
        variant === "circle" && "bg-surface shadow-[0_2px_8px_rgba(27,34,80,0.08)]",
        variant === "glass" && "bg-white/25 backdrop-blur-sm",
        variant === "glass" ? "text-white" : isSaved ? "text-accent" : "text-ink-2",
      )}
    >
      <Icon size={20} />
    </button>
  );
}
