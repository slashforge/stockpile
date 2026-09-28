import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { IoRefresh } from "react-icons/io5";
import { useBuyFlow } from "@/components/trade/flows";
import { legBlocking, LegRow } from "@/components/trade/leg-row";
import { ConfirmSheet, ProgressHero, StepFrame } from "@/components/trade/steps";
import { PrimaryButton } from "@/components/ui/button";
import { Card, Divider, Notice } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { totalInput, tradeErrorMessage } from "@/lib/trade/legs";
import { legDisplayStatus, legsToSign } from "@/lib/trade/purchase";
import { legSignature } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatMoney } from "@/utils/amounts";

export const Route = createFileRoute("/buy/$bagId/progress")({ component: BuyProgressScreen });

function BuyProgressScreen() {
  const flow = useBuyFlow();
  const auth = useStockpileAuth();
  const navigate = useNavigate();
  const { bag, prepared, signing, alreadyBought, request, prepare } = flow;
  const [retryError, setRetryError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ready = prepared?.status === "ready" ? prepared : null;
  const bagData = bag.data;
  if (!ready || !bagData) return null;

  // Signing starts in the same tick this screen is pushed; "idle" here only means it hasn't rendered yet.
  const status = flow.status === "idle" ? (retryError ? "partial" : "running") : flow.status;
  const displays = ready.transactions.map((tx, index) => legDisplayStatus(signing.states[index], alreadyBought.has(tx.outputMint)));
  const done = displays.filter((value) => value === "confirmed" || value === "earlier").length;
  const retryable = legsToSign(flow.outputMints, signing.states, alreadyBought).length;
  const pendingUnknown = status === "partial" && displays.includes("submitted");

  const retry = () => {
    if (!request) return;
    setRetryError(null);
    flow.runPrepare(request, {
      carry: true,
      onDone: (data, carried) => {
        if (data.status !== "ready") {
          setRetryError(tradeErrorMessage(data.error, data.message ?? "Couldn’t rebuild the swaps."));
          return;
        }
        const total = data.transactions.length;
        const problems = data.transactions.flatMap((tx, index) => legBlocking(tx, bagData, index, total, auth.walletAddress));
        if (problems.length > 0 || (data.walletAddress && data.walletAddress !== auth.walletAddress)) {
          setRetryError(`Blocked for your safety. ${problems.join(" ")}`.trim());
          return;
        }
        const indices = legsToSign(
          data.transactions.map((tx) => tx.outputMint),
          {},
          carried,
        );
        signing.signAll(indices.map((index) => ({ index, transaction: data.transactions[index]!.transaction })));
      },
    });
  };

  const heading =
    status === "complete"
      ? "Bag bought"
      : status === "partial"
        ? pendingUnknown && retryable === 0
          ? "Still confirming"
          : "Some swaps didn’t go through"
        : "Buying your bag…";
  const caption =
    status === "complete"
      ? "Every swap confirmed on-chain. Your portfolio shows the new balances."
      : status === "partial"
        ? pendingUnknown && retryable === 0
          ? "Solana hasn’t confirmed every swap yet. Check the explorer links or your portfolio in a moment."
          : `${done} of ${displays.length} confirmed. Retry only buys what’s missing.`
        : `${done} of ${displays.length} confirmed · signing and sending every swap`;

  return (
    <StepFrame
      footer={
        status === "running" ? null : (
          <>
            {status === "complete" ? (
              <PrimaryButton label="View portfolio" onClick={() => navigate({ to: "/portfolio", replace: true })} />
            ) : retryable > 0 ? (
              <PrimaryButton label={`Retry failed · ${retryable}`} icon={IoRefresh} onClick={() => setConfirming(true)} loading={prepare.isPending} />
            ) : null}
            <PrimaryButton label="Done" variant="ghost" size="md" onClick={flow.close} />
          </>
        )
      }
    >
      <ProgressHero status={status} heading={heading} caption={caption} />
      <Card padded={false} className="gap-0">
        {ready.transactions.map((tx, index) => {
          const state = signing.states[index];
          const signature = legSignature(state);
          return (
            <div key={`${flow.preparedAt}-${index}`}>
              {index > 0 ? <Divider inset={58} /> : null}
              <LegRow
                tx={tx}
                bag={bagData}
                status={displays[index]}
                error={state?.status === "failed" ? state.error : undefined}
                signature={signature}
                linkFailed={!!signature && flow.lots.states[signature] === "failed"}
                onRetryLink={signature ? () => flow.lots.retry(signature) : undefined}
              />
            </div>
          );
        })}
        <Divider />
        <div className="flex items-center px-4 py-3">
          <T variant="subhead" className="flex-1">
            Total
          </T>
          <T variant="numeric">{formatMoney(totalInput(ready.transactions).toString(), USDC_DECIMALS)} USDC</T>
        </div>
      </Card>
      {retryError || prepare.isError ? (
        <Notice tone="error">
          <T variant="footnote" tone="danger">
            {retryError ?? prepare.error?.message}
          </T>
        </Notice>
      ) : null}
      <ConfirmSheet
        open={confirming}
        title={`Retry ${retryable} ${retryable === 1 ? "swap" : "swaps"}?`}
        body="Builds fresh transactions for the swaps that didn’t go through and sends them. Assets you already bought are skipped. This can’t be undone."
        confirmLabel="Retry"
        onConfirm={retry}
        onClose={() => setConfirming(false)}
      />
    </StepFrame>
  );
}
