import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { IoAlertCircleOutline, IoPersonCircle, IoWalletOutline } from "react-icons/io5";
import { useSellFlow } from "@/components/trade/flows";
import { SellAmountStep } from "@/components/trade/sell-amount";
import { MessageState, Skeleton } from "@/components/ui/layout";
import { formatUsdValue } from "@/lib/portfolio";
import { tradeErrorMessage } from "@/lib/trade/legs";
import { useStockpileAuth } from "@/providers/auth-context";

export const Route = createFileRoute("/sell/$bagId/")({ component: SellAmountScreen });

function SellAmountScreen() {
  const flow = useSellFlow();
  const auth = useStockpileAuth();
  const navigate = useNavigate();
  const { bag, quote, prepare, prepared, portionBps, position } = flow;

  if (!bag.data) {
    return (
      <div className="flex flex-1 flex-col items-center gap-3 px-4 pt-6">
        {bag.isError ? (
          <MessageState tone="error" icon={IoAlertCircleOutline} title="Bag unavailable" body={bag.error.message} />
        ) : (
          <>
            <Skeleton height={68} width={210} radius={18} />
            <Skeleton height={200} radius={16} />
          </>
        )}
      </div>
    );
  }
  if (!auth.authenticated) {
    return <MessageState icon={IoPersonCircle} title="Sign in to continue" body="Sign in to sell from this bag." />;
  }
  if (!auth.walletAddress) {
    return (
      <MessageState
        icon={IoWalletOutline}
        title="Setting up your wallet"
        body="Your Solana wallet isn't ready yet. This usually takes a few seconds after your first sign-in."
      />
    );
  }

  const portionLabel = `${portionBps / 100}%`;
  const prepareError = prepare.isError
    ? prepare.error.message
    : !prepare.isPending && prepared?.status === "unavailable"
      ? tradeErrorMessage(prepared.error, prepared.message ?? "The swaps couldn’t be built right now.")
      : null;

  return (
    <SellAmountStep
      quote={quote}
      portionBps={portionBps}
      onPortion={(bps) => {
        flow.setPortionBps(bps);
        prepare.reset();
      }}
      caption={
        position?.valueUsd != null
          ? `USDC · ${portionLabel} of your ${formatUsdValue(position.valueUsd)} position`
          : `USDC · selling ${portionLabel} of this bag`
      }
      subject={bag.data}
      legCountHint={Math.min(Math.max(bag.data.assets.length, 1), 4)}
      prepareError={prepareError}
      preparing={prepare.isPending}
      onReview={() =>
        flow.runPrepare(flow.request, {
          onDone: (data) => {
            if (data.status === "ready" && data.transactions.length > 0) {
              navigate({ to: "/sell/$bagId/review", params: { bagId: flow.bagId } });
            }
          },
        })
      }
    />
  );
}
