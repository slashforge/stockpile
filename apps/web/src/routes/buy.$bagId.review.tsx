import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { IoAlertCircleOutline, IoHourglassOutline, IoRefresh, IoTimeOutline, IoWarningOutline } from "react-icons/io5";
import { toast } from "sonner";
import { protectionLabel } from "@/components/trade/controls";
import { useBuyFlow } from "@/components/trade/flows";
import { legBlocking, LegRow } from "@/components/trade/leg-row";
import { SlideToConfirm } from "@/components/trade/slide-to-confirm";
import { StepFrame } from "@/components/trade/steps";
import { PrimaryButton } from "@/components/ui/button";
import { Card, Divider, MessageState, Notice, Pill } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { isPreIpoBag, PRE_IPO_REVIEW_NOTE } from "@/lib/pre-ipo";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { impactLevel, totalInput } from "@/lib/trade/legs";
import { legsToSign } from "@/lib/trade/purchase";
import { isPreparedExpired } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatMoney, shortAddress } from "@/utils/amounts";

export const Route = createFileRoute("/buy/$bagId/review")({ component: BuyReviewScreen });

function BuyReviewScreen() {
  const flow = useBuyFlow();
  const auth = useStockpileAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const { bag, prepared, preparedAt, expired, secondsLeft, request, prepare, signing } = flow;
  const bagData = bag.data;
  const ready = prepared?.status === "ready" ? prepared : null;
  const [slideReset, setSlideReset] = useState(0);

  const blocking = useMemo(() => {
    if (!ready || !bagData) return [];
    const total = ready.transactions.length;
    return ready.transactions.flatMap((tx, index) =>
      legBlocking(tx, bagData, index, total, auth.walletAddress).map((problem) => `${tx.symbol}: ${problem}`),
    );
  }, [ready, bagData, auth.walletAddress]);

  if (!bagData || !ready) {
    return (
      <MessageState
        tone="error"
        icon={IoAlertCircleOutline}
        title="Nothing to review"
        body="Pick an amount to build this purchase."
        actionLabel="Back"
        onAction={() => router.history.back()}
      />
    );
  }

  const walletMismatch = !!ready.walletAddress && ready.walletAddress !== auth.walletAddress;
  const totalUsdc = formatMoney(totalInput(ready.transactions).toString(), USDC_DECIMALS);
  const warnLegs = ready.transactions.filter((tx) => {
    const level = impactLevel(tx.priceImpactPct);
    return level === "warn" || level === "high";
  });
  const toSign = legsToSign(flow.outputMints, signing.states, flow.alreadyBought);
  const blocked = blocking.length > 0 || walletMismatch;

  const buy = () => {
    // The clock only ticks once a second; never send a transaction past the blockhash lifetime.
    if (isPreparedExpired(preparedAt, Date.now())) {
      flow.refreshClock();
      setSlideReset((n) => n + 1);
      toast.error("Prices expired", {
        description: "This purchase waited too long and would fail on Solana. Nothing was sent. Refresh and try again.",
      });
      return;
    }
    navigate({ to: "/buy/$bagId/progress", params: { bagId: flow.bagId } });
    signing.signAll(toSign.map((index) => ({ index, transaction: ready.transactions[index]!.transaction })));
  };

  return (
    <StepFrame
      footer={
        expired || prepare.isPending ? (
          <PrimaryButton
            label="Refresh prices"
            icon={IoRefresh}
            onClick={() => request && flow.runPrepare(request)}
            loading={prepare.isPending}
            disabled={!request}
          />
        ) : (
          <SlideToConfirm
            label={`Swipe to buy · $${totalUsdc}`}
            onConfirm={buy}
            disabled={blocked || toSign.length === 0}
            resetKey={slideReset}
            hint={`Drag right to buy ${bagData.title}`}
          />
        )
      }
    >
      <Card className="flex-row items-center">
        <div className="flex flex-1 flex-col">
          <T variant="caption" tone="tertiary">
            You put in
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
            Price protection {protectionLabel(ready.slippageBps)} · Network fees on us
          </T>
        </div>
      </Card>

      <Card padded={false} className="gap-0">
        {ready.transactions.map((tx, index) => (
          <div key={`${preparedAt}-${index}`}>
            {index > 0 ? <Divider inset={58} /> : null}
            <LegRow tx={tx} bag={bagData} />
          </div>
        ))}
        <Divider />
        <div className="flex items-center px-4 py-3">
          <T variant="subhead" className="flex-1">
            Total · {ready.transactions.length} swaps
          </T>
          <T variant="numeric">{totalUsdc} USDC</T>
        </div>
      </Card>

      {warnLegs.length > 0 ? (
        <Notice tone="caution" icon={IoWarningOutline}>
          <T variant="footnote" tone="caution">
            {warnLegs.map((tx) => tx.symbol).join(", ")} {warnLegs.length === 1 ? "has" : "have"} thin liquidity, so part of
            your money is lost to price impact. A smaller amount helps.
          </T>
        </Notice>
      ) : null}
      {isPreIpoBag(bagData) ? (
        <Notice tone="caution" icon={IoHourglassOutline}>
          <T variant="footnote" tone="caution">
            {PRE_IPO_REVIEW_NOTE}
          </T>
        </Notice>
      ) : null}
      {walletMismatch ? (
        <Notice tone="error">
          <T variant="footnote" tone="danger">
            Built for {shortAddress(ready.walletAddress ?? "")}, which isn’t your signed-in wallet (
            {shortAddress(auth.walletAddress ?? "")}). Buying is blocked.
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
            Buying is blocked for your safety.
          </T>
        </Notice>
      ) : null}
      {prepare.isError ? (
        <T variant="footnote" tone="danger" align="center">
          {prepare.error.message}
        </T>
      ) : null}
      <T variant="caption" tone="tertiary" align="center">
        Swiping signs every swap from your wallet at once. Estimates move until they land; price protection cancels a swap
        if the price moves too far. Stockpile covers network fees. Not investment advice.
      </T>
    </StepFrame>
  );
}
