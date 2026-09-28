import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { IoAlertCircleOutline, IoRefresh, IoTimeOutline, IoWarningOutline } from "react-icons/io5";
import { toast } from "sonner";
import { protectionLabel } from "@/components/trade/controls";
import { sellTotalOut, tokenLegBlocking, useTokenSellFlow } from "@/components/trade/flows";
import { LegRow } from "@/components/trade/leg-row";
import { SlideToConfirm } from "@/components/trade/slide-to-confirm";
import { StepFrame } from "@/components/trade/steps";
import { PrimaryButton } from "@/components/ui/button";
import { Card, Divider, MessageState, Notice, Pill } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { impactLevel } from "@/lib/trade/legs";
import { legsToSign } from "@/lib/trade/purchase";
import { isPreparedExpired } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatMoney, shortAddress } from "@/utils/amounts";

export const Route = createFileRoute("/sell-tokens/review")({ component: SellTokensReviewScreen });

function SellTokensReviewScreen() {
  const flow = useTokenSellFlow();
  const auth = useStockpileAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const { prepared, preparedAt, expired, secondsLeft, request, prepare, signing, portionBps, subject, mints } = flow;
  const ready = prepared?.status === "ready" ? prepared : null;
  const [slideReset, setSlideReset] = useState(0);
  const legSubject = useMemo(
    () => ({ assets: subject.assets.map((asset) => ({ mint: asset.mint, iconUrl: asset.iconUrl ?? null })) }),
    [subject],
  );

  const blocking = useMemo(() => {
    if (!ready) return [];
    const total = ready.transactions.length;
    return ready.transactions.flatMap((tx, index) =>
      tokenLegBlocking(tx, mints, index, total, auth.walletAddress).map((problem) => `${tx.symbol}: ${problem}`),
    );
  }, [ready, mints, auth.walletAddress]);

  if (!ready) {
    return (
      <MessageState
        tone="error"
        icon={IoAlertCircleOutline}
        title="Nothing to review"
        body="Pick how much to sell to build this sale."
        actionLabel="Back"
        onAction={() => router.history.back()}
      />
    );
  }

  const walletMismatch = !!ready.walletAddress && ready.walletAddress !== auth.walletAddress;
  const totalUsdc = formatMoney(sellTotalOut(ready).toString(), USDC_DECIMALS);
  const warnLegs = ready.transactions.filter((tx) => {
    const level = impactLevel(tx.priceImpactPct);
    return level === "warn" || level === "high";
  });
  const toSign = legsToSign(flow.assetMints, signing.states, flow.alreadySold);
  const blocked = blocking.length > 0 || walletMismatch;

  const sell = () => {
    if (isPreparedExpired(preparedAt, Date.now())) {
      flow.refreshClock();
      setSlideReset((n) => n + 1);
      toast.error("Prices expired", {
        description: "This sale waited too long and would fail on Solana. Nothing was sent. Refresh and try again.",
      });
      return;
    }
    navigate({ to: "/sell-tokens/progress", search: (prev) => prev });
    signing.signAll(toSign.map((index) => ({ index, transaction: ready.transactions[index]!.transaction })));
  };

  return (
    <StepFrame
      footer={
        expired || prepare.isPending ? (
          <PrimaryButton label="Refresh prices" icon={IoRefresh} onClick={() => flow.runPrepare(request)} loading={prepare.isPending} />
        ) : (
          <SlideToConfirm
            label={`Swipe to sell · ≈ $${totalUsdc}`}
            tone="danger"
            onConfirm={sell}
            disabled={blocked || toSign.length === 0}
            resetKey={slideReset}
            hint={`Drag right to sell ${portionBps / 100}% of ${subject.title}`}
          />
        )
      }
    >
      <Card className="flex-row items-center">
        <div className="flex flex-1 flex-col">
          <T variant="caption" tone="tertiary">
            You get back about
          </T>
          <T variant="title2">${totalUsdc} USDC</T>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Pill
            icon={IoTimeOutline}
            label={prepare.isPending ? "Refreshing…" : expired ? "Expired" : `Expires in ${secondsLeft ?? 0}s`}
            tone={expired || (secondsLeft ?? 0) <= 15 ? "caution" : "accent"}
            className="self-end"
          />
          <T variant="caption" tone="tertiary" align="right">
            Selling {portionBps / 100}% · Protection {protectionLabel(ready.slippageBps)} · Fees on us
          </T>
        </div>
      </Card>

      <Card padded={false} className="gap-0">
        {ready.transactions.map((tx, index) => (
          <div key={`${preparedAt}-${index}`}>
            {index > 0 ? <Divider inset={58} /> : null}
            <LegRow tx={tx} bag={legSubject} side="sell" />
          </div>
        ))}
        <Divider />
        <div className="flex items-center px-4 py-3">
          <T variant="subhead" className="flex-1">
            Total · {ready.transactions.length} {ready.transactions.length === 1 ? "swap" : "swaps"} to USDC
          </T>
          <T variant="numeric">{totalUsdc} USDC</T>
        </div>
      </Card>

      {warnLegs.length > 0 ? (
        <Notice tone="caution" icon={IoWarningOutline}>
          <T variant="footnote" tone="caution">
            {warnLegs.map((tx) => tx.symbol).join(", ")} {warnLegs.length === 1 ? "has" : "have"} thin liquidity, so part of
            the value is lost to price impact. Selling a smaller portion helps.
          </T>
        </Notice>
      ) : null}
      {walletMismatch ? (
        <Notice tone="error">
          <T variant="footnote" tone="danger">
            Built for {shortAddress(ready.walletAddress ?? "")}, which isn’t your signed-in wallet (
            {shortAddress(auth.walletAddress ?? "")}). Selling is blocked.
          </T>
        </Notice>
      ) : null}
      {blocking.length > 0 ? (
        <Notice tone="error">
          {blocking.map((problem) => (
            <T key={problem} variant="footnote" tone="danger">
              {problem}
            </T>
          ))}
          <T variant="footnote" tone="danger" className="font-semibold">
            Selling is blocked for your safety.
          </T>
        </Notice>
      ) : null}
      {prepare.isError ? (
        <T variant="footnote" tone="danger" align="center">
          {prepare.error.message}
        </T>
      ) : null}
      <T variant="caption" tone="tertiary" align="center">
        Only tokens outside your bags are sold, so your bags stay as they are. Swiping signs every swap at once. Stockpile
        covers network fees. This can’t be undone.
      </T>
    </StepFrame>
  );
}
