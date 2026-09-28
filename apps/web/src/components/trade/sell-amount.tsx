import type { UseQueryResult } from "@tanstack/react-query";
import { UsdcLogo } from "@/components/stockpile/token-avatar";
import { Spinner, PrimaryButton } from "@/components/ui/button";
import { Card, Divider, Skeleton } from "@/components/ui/layout";
import { cn, T } from "@/components/ui/type";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { tradeErrorMessage } from "@/lib/trade/legs";
import type { QuoteLeg } from "@/services/api/types";
import { formatMoney } from "@/utils/amounts";
import { Chip, heroSize } from "./controls";
import { minTotalOut, SELL_PORTIONS, sellTotalOut } from "./flows";
import { LegRow } from "./leg-row";
import { LegSkeletonRows } from "./steps";

type SellQuote =
  | { status: "available"; legs: QuoteLeg[]; totalOutAmount?: string | null }
  | { status: "unavailable"; error: Parameters<typeof tradeErrorMessage>[0]; message?: string | null };

/**
 * Shared "how much to sell" step for bag sells and direct token sells: estimate hero, portion
 * chips, the swaps to USDC and the review action.
 */
export function SellAmountStep({
  quote,
  portionBps,
  onPortion,
  caption,
  subject,
  legCountHint,
  prepareError,
  preparing,
  onReview,
}: {
  quote: UseQueryResult<SellQuote>;
  portionBps: number;
  onPortion: (bps: number) => void;
  caption: string;
  subject: { assets: { mint: string | null; iconUrl: string | null }[] };
  legCountHint: number;
  prepareError: string | null;
  preparing: boolean;
  onReview: () => void;
}) {
  const available = quote.data?.status === "available" ? quote.data : null;
  const totalOut = available ? sellTotalOut(available) : null;
  const minOut = available ? minTotalOut(available.legs) : null;
  const firstLoad = quote.isPending;
  const updating = quote.isPlaceholderData;
  const heroText = totalOut != null ? `≈ $${formatMoney(totalOut.toString(), USDC_DECIMALS)}` : "—";
  const legCount = available?.legs.length ?? legCountHint;
  const quoteError = quote.isError
    ? quote.error.message
    : quote.data?.status === "unavailable" && !quote.isPlaceholderData
      ? tradeErrorMessage(quote.data.error, quote.data.message ?? "Couldn’t price this sale right now.")
      : null;
  const error = prepareError ?? quoteError;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-1">
      <div className="flex min-h-[150px] flex-1 flex-col items-center justify-center gap-2">
        <T variant="overline" tone="tertiary" className="font-semibold">
          You get back
        </T>
        {firstLoad ? (
          <div className="flex h-[84px] items-center" aria-label="Estimate loading">
            <Skeleton height={68} width={210} radius={18} />
          </div>
        ) : (
          <T
            className={cn(
              "w-full text-center font-extrabold tabular-nums",
              heroSize(heroText),
              totalOut == null && "text-ink-3",
              updating && "opacity-45",
            )}
            aria-live="polite"
          >
            {heroText}
          </T>
        )}
        <div className="flex items-center justify-center gap-2 px-3">
          <UsdcLogo size={14} />
          <T variant="footnote" tone="tertiary" align="center" lines={2}>
            {caption}
          </T>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        {SELL_PORTIONS.map((bps) => (
          <Chip key={bps} compact label={bps === 10000 ? "All" : `${bps / 100}%`} selected={portionBps === bps} onClick={() => onPortion(bps)} />
        ))}
      </div>
      <div className="-mb-1 flex items-center justify-between px-1">
        <T variant="footnote" tone="secondary" className="font-semibold">
          Swaps to USDC
        </T>
        <div className="flex items-center gap-1.5 text-ink-3">
          {updating || firstLoad ? <Spinner size={14} /> : null}
          <T variant="footnote" tone="tertiary">
            {updating || firstLoad ? "Getting prices" : `${legCount} ${legCount === 1 ? "token" : "tokens"}`}
          </T>
        </div>
      </div>
      <div className="min-h-0 shrink overflow-y-auto pb-1">
        {available ? (
          <div className={cn(updating && "opacity-45")}>
            <Card padded={false} className="gap-0 rounded-2xl">
              {available.legs.map((leg, index) => (
                <div key={`${leg.inputMint}-${index}`}>
                  {index > 0 ? <Divider inset={58} /> : null}
                  <LegRow tx={leg} bag={subject} side="sell" />
                </div>
              ))}
              {minOut != null ? (
                <>
                  <Divider />
                  <div className="flex items-center px-4 py-[11px]">
                    <T variant="footnote" tone="secondary" className="flex-1">
                      Minimum received
                    </T>
                    <T variant="numeric">${formatMoney(minOut.toString(), USDC_DECIMALS)}</T>
                  </div>
                </>
              ) : null}
            </Card>
          </div>
        ) : firstLoad ? (
          <LegSkeletonRows count={legCount} />
        ) : null}
      </div>
      {error ? (
        <T variant="footnote" tone="danger" align="center" lines={3}>
          {error}
        </T>
      ) : null}
      <PrimaryButton
        label="Review sale"
        onClick={onReview}
        disabled={!available || available.legs.length === 0 || updating}
        loading={preparing}
      />
    </div>
  );
}
