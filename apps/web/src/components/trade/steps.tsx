import type { ReactNode } from "react";
import { IoAlert, IoCheckmark } from "react-icons/io5";
import { Sheet } from "@/components/sheets/sheet";
import { PrimaryButton, Spinner } from "@/components/ui/button";
import { Card, Divider, Skeleton } from "@/components/ui/layout";
import { cn, T } from "@/components/ui/type";
import type { PurchaseStatus } from "@/lib/trade/purchase";

/** Scrollable step body with a pinned footer for the primary action. */
export function StepFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-1">{children}</div>
      {footer ? <div className="flex flex-col gap-1 px-4 pb-4 pt-2">{footer}</div> : null}
    </>
  );
}

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={title} size="sm">
      <div className="flex flex-col gap-3 p-5 pt-6">
        <T as="h2" variant="title3" className="pr-10">
          {title}
        </T>
        <T variant="callout" tone="secondary" className="whitespace-pre-line">
          {body}
        </T>
        <div className="mt-2 flex gap-2">
          <PrimaryButton className="flex-1" label="Cancel" variant="outline" size="md" onClick={onClose} />
          <PrimaryButton
            className="flex-1"
            label={confirmLabel}
            size="md"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          />
        </div>
      </div>
    </Sheet>
  );
}

/** Progress hero: spinner while running, check when complete, alert when partial. */
export function ProgressHero({ status, heading, caption }: { status: PurchaseStatus | "running"; heading: string; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <div
        className={cn(
          "mb-1.5 flex size-[60px] items-center justify-center rounded-full text-on-accent",
          status === "complete" ? "bg-positive" : status === "partial" ? "bg-caution" : "bg-accent",
        )}
      >
        {status === "complete" ? <IoCheckmark size={30} /> : status === "partial" ? <IoAlert size={30} /> : <Spinner size={26} />}
      </div>
      <T as="h2" variant="title2" align="center" aria-live="polite">
        {heading}
      </T>
      <T variant="footnote" tone="secondary" align="center">
        {caption}
      </T>
    </div>
  );
}

export function LegSkeletonRows({ count }: { count: number }) {
  return (
    <Card padded={false} className="gap-0 rounded-2xl">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          {index > 0 ? <Divider inset={58} /> : null}
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Skeleton height={32} width={32} radius={16} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton height={14} width="38%" radius={6} />
              <Skeleton height={11} width="62%" radius={5} />
            </div>
            <Skeleton height={16} width={52} radius={6} />
          </div>
        </div>
      ))}
    </Card>
  );
}
