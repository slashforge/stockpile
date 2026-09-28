import { IoAlertCircle, IoCheckmarkCircle, IoOpenOutline } from "react-icons/io5";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { Spinner } from "@/components/ui/button";
import { Pill } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { useMintDecimals } from "@/hooks/use-mint-decimals";
import { explorerTxUrl, inspectTransaction, USDC_DECIMALS } from "@/lib/solana/transaction";
import { impactLevel, impactPercent, legAssetMint, legLabelProblems, type TradeSide } from "@/lib/trade/legs";
import type { LegDisplayStatus } from "@/lib/trade/purchase";
import type { Bag, PreparedTransaction, QuoteLeg } from "@/services/api/types";
import { formatMoney, formatTokenAmount } from "@/utils/amounts";
import { ImpactLabel } from "./controls";

/** Everything that blocks signing a leg: decode errors, unsafe instructions, label mismatches. */
export function legBlocking(
  tx: PreparedTransaction,
  bag: Bag,
  index: number,
  total: number,
  walletAddress: string | null,
  side: TradeSide = "buy",
): string[] {
  let errors: string[];
  try {
    errors = inspectTransaction(tx.transaction, walletAddress).errors;
  } catch (error) {
    errors = [error instanceof Error ? error.message : "Could not decode transaction"];
  }
  return [...errors, ...legLabelProblems(tx, bag, index, total, side)];
}

/**
 * Formats a raw amount of the leg's bag token. Buys carry the decimals on the leg; sells (and legs
 * the API couldn't resolve) look them up on chain.
 */
export function TokenAmount({ tx, raw, side = "buy" }: { tx: QuoteLeg; raw: string; side?: TradeSide }) {
  const mint = legAssetMint(tx, side);
  const known = side === "buy" ? tx.outputDecimals : null;
  const decimals = useMintDecimals(known == null ? [mint] : []);
  const value = known ?? decimals.data?.[mint];
  return <>{value != null ? formatTokenAmount(raw, value, tx.uiAmountMultiplier) : `${raw} units`}</>;
}

export function LegStatusPill({ status, side = "buy" }: { status: LegDisplayStatus; side?: TradeSide }) {
  switch (status) {
    case "signing":
      return <Pill label="Signing" />;
    case "submitted":
      return <Pill label="Submitted" tone="accent" />;
    case "confirmed":
      return <Pill label="Confirmed" tone="positive" icon={IoCheckmarkCircle} />;
    case "earlier":
      return <Pill label={side === "sell" ? "Sold earlier" : "Bought earlier"} tone="positive" icon={IoCheckmarkCircle} />;
    case "failed":
      return <Pill label="Failed" tone="caution" icon={IoAlertCircle} />;
    default:
      return <Pill label="Queued" />;
  }
}

/** One dense row per leg: avatar, symbol, estimate, and either an amount or a status on the right. */
export function LegRow({
  tx,
  bag,
  status,
  error,
  signature,
  side = "buy",
  linkFailed = false,
  onRetryLink,
}: {
  tx: QuoteLeg;
  bag: { assets: { mint: string | null; iconUrl: string | null }[] };
  status?: LegDisplayStatus;
  error?: string;
  signature?: string;
  side?: TradeSide;
  linkFailed?: boolean;
  onRetryLink?: () => void;
}) {
  const mint = legAssetMint(tx, side);
  const asset = bag.assets.find((candidate) => candidate.mint === mint);
  const level = impactLevel(tx.priceImpactPct);
  const usdc = side === "sell" ? tx.outAmount : tx.inputAmount;
  return (
    <div className="flex items-center gap-2.5 px-4 py-[9px]">
      <TokenAvatar symbol={tx.symbol} iconUrl={asset?.iconUrl} mint={mint} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <div className="flex items-center gap-2">
          <T variant="subhead" lines={1}>
            {tx.symbol}
          </T>
          {status ? null : <ImpactLabel level={level} impact={impactPercent(tx.priceImpactPct)} />}
        </div>
        {status && error ? (
          <T variant="caption" tone="danger" lines={2}>
            {error}
          </T>
        ) : side === "sell" ? (
          <T variant="caption" tone="tertiary" lines={1}>
            Sell <TokenAmount tx={tx} raw={tx.inputAmount} side="sell" /> {tx.symbol}
            {tx.minOutAmount ? ` · min $${formatMoney(tx.minOutAmount, USDC_DECIMALS)}` : null}
          </T>
        ) : (
          <T variant="caption" tone="tertiary" lines={1}>
            ${formatMoney(usdc, USDC_DECIMALS)} USDC
            {tx.minOutAmount ? (
              <>
                {" · min "}
                <TokenAmount tx={tx} raw={tx.minOutAmount} />
              </>
            ) : null}
          </T>
        )}
        {linkFailed ? (
          <button type="button" onClick={onRetryLink} disabled={!onRetryLink} className="self-start text-left">
            <T as="span" variant="caption" tone="tertiary">
              Couldn’t link this swap to the bag ·{" "}
              <T as="span" variant="caption" tone="accent" className="font-semibold">
                Retry
              </T>
            </T>
          </button>
        ) : null}
      </div>
      {status ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {status === "signing" || status === "submitted" ? <Spinner size={16} className="text-accent" /> : null}
          <LegStatusPill status={status} side={side} />
          {signature ? (
            <a
              href={explorerTxUrl(signature)}
              target="_blank"
              rel="noreferrer"
              aria-label={`View ${tx.symbol} transaction on Solscan`}
              className="text-ink-3 hover:text-accent"
            >
              <IoOpenOutline size={15} />
            </a>
          ) : null}
        </div>
      ) : side === "sell" ? (
        <T variant="numeric" className="shrink-0">
          ${formatMoney(tx.outAmount, USDC_DECIMALS)}
        </T>
      ) : (
        <T variant="numeric" className="shrink-0">
          <TokenAmount tx={tx} raw={tx.outAmount} />
        </T>
      )}
    </div>
  );
}
