import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { IoRefresh } from "react-icons/io5";
import { sellTotalOut, tokenLegBlocking, useTokenSellFlow } from "@/components/trade/flows";
import { LegRow } from "@/components/trade/leg-row";
import { ConfirmSheet, ProgressHero, StepFrame } from "@/components/trade/steps";
import { PrimaryButton } from "@/components/ui/button";
import { Card, Divider, Notice } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { USDC_DECIMALS } from "@/lib/solana/transaction";
import { tradeErrorMessage } from "@/lib/trade/legs";
import { legDisplayStatus, legsToSign } from "@/lib/trade/purchase";
import { legSignature } from "@/lib/trade/signing";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatMoney } from "@/utils/amounts";

export const Route = createFileRoute("/sell-tokens/progress")({ component: SellTokensProgressScreen });

function SellTokensProgressScreen() {
  const flow = useTokenSellFlow();
  const auth = useStockpileAuth();
  const navigate = useNavigate();
  const { prepared, signing, alreadySold, request, prepare, subject } = flow;
  const [retryError, setRetryError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const legSubject = useMemo(
    () => ({ assets: subject.assets.map((asset) => ({ mint: asset.mint, iconUrl: asset.iconUrl ?? null })) }),
    [subject],
  );
  const ready = prepared?.status === "ready" ? prepared : null;
  if (!ready) return null;

  const status = flow.status === "idle" ? (retryError ? "partial" : "running") : flow.status;
  const displays = ready.transactions.map((tx, index) => legDisplayStatus(signing.states[index], alreadySold.has(tx.inputMint)));
  const done = displays.filter((value) => value === "confirmed" || value === "earlier").length;
  const retryable = legsToSign(flow.assetMints, signing.states, alreadySold).length;
  const pendingUnknown = status === "partial" && displays.includes("submitted");
  const soldEarlier = alreadySold.size;

  const retry = () => {
    setRetryError(null);
    flow.runPrepare(request, {
      carry: true,
      onDone: (data) => {
        if (data.status !== "ready") {
          setRetryError(tradeErrorMessage(data.error, data.message ?? "Couldn’t rebuild the swaps."));
          return;
        }
        const total = data.transactions.length;
        const problems = data.transactions.flatMap((tx, index) => tokenLegBlocking(tx, flow.mints, index, total, auth.walletAddress));
        if (problems.length > 0 || (data.walletAddress && data.walletAddress !== auth.walletAddress)) {
          setRetryError(`Blocked for your safety. ${problems.join(" ")}`.trim());
          return;
        }
        signing.signAll(data.transactions.map((tx, index) => ({ index, transaction: tx.transaction })));
      },
    });
  };

  const heading =
    status === "complete"
      ? "Sold to USDC"
      : status === "partial"
        ? pendingUnknown && retryable === 0
          ? "Still confirming"
          : "Some swaps didn’t go through"
        : "Selling your tokens…";
  const caption =
    status === "complete"
      ? "Every swap confirmed on-chain. The USDC is in your wallet."
      : status === "partial"
        ? pendingUnknown && retryable === 0
          ? "Solana hasn’t confirmed every swap yet. Check the explorer links or your portfolio in a moment."
          : `${done} of ${displays.length} confirmed. Retry only sells what’s left.`
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
      <ProgressHero status={status} heading={heading} caption={`${caption}${soldEarlier > 0 ? ` ${soldEarlier} sold earlier.` : ""}`} />
      <Card padded={false} className="gap-0">
        {ready.transactions.map((tx, index) => {
          const state = signing.states[index];
          return (
            <div key={`${flow.preparedAt}-${index}`}>
              {index > 0 ? <Divider inset={58} /> : null}
              <LegRow
                tx={tx}
                bag={legSubject}
                side="sell"
                status={displays[index]}
                error={state?.status === "failed" ? state.error : undefined}
                signature={legSignature(state)}
              />
            </div>
          );
        })}
        <Divider />
        <div className="flex items-center px-4 py-3">
          <T variant="subhead" className="flex-1">
            Estimated back
          </T>
          <T variant="numeric">{formatMoney(sellTotalOut(ready).toString(), USDC_DECIMALS)} USDC</T>
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
        body="Builds fresh transactions for the tokens that didn’t sell and swaps them to USDC. Tokens already sold are skipped. This can’t be undone."
        confirmLabel="Retry"
        onConfirm={retry}
        onClose={() => setConfirming(false)}
      />
    </StepFrame>
  );
}
