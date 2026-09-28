import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { IoLayersOutline, IoPersonCircle } from "react-icons/io5";
import { useTokenSellFlow } from "@/components/trade/flows";
import { SellAmountStep } from "@/components/trade/sell-amount";
import { MessageState } from "@/components/ui/layout";
import { formatUsdValue } from "@/lib/portfolio";
import { tradeErrorMessage } from "@/lib/trade/legs";
import { useStockpileAuth } from "@/providers/auth-context";

export const Route = createFileRoute("/sell-tokens/")({ component: SellTokensAmountScreen });

function SellTokensAmountScreen() {
  const flow = useTokenSellFlow();
  const auth = useStockpileAuth();
  const navigate = useNavigate();
  const { quote, prepare, prepared, portionBps, subject, picked, mints } = flow;

  if (mints.length === 0) {
    return <MessageState icon={IoLayersOutline} title="Nothing picked" body="Pick tokens from your holdings to sell them." />;
  }
  if (!auth.authenticated || !auth.walletAddress) {
    return <MessageState icon={IoPersonCircle} title="Sign in to continue" body="Sign in to sell tokens from your wallet." />;
  }

  const pickedUsd = picked.every((holding) => holding.usdValue != null)
    ? picked.reduce((sum, holding) => sum + (holding.usdValue ?? 0), 0)
    : null;
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
        pickedUsd != null
          ? `USDC · ${portionLabel} of ${formatUsdValue(pickedUsd)} in ${subject.title}`
          : `USDC · selling ${portionLabel} of ${subject.title}`
      }
      subject={{ assets: subject.assets.map((asset) => ({ mint: asset.mint, iconUrl: asset.iconUrl ?? null })) }}
      legCountHint={mints.length}
      prepareError={prepareError}
      preparing={prepare.isPending}
      onReview={() =>
        flow.runPrepare(flow.request, {
          onDone: (data) => {
            if (data.status === "ready" && data.transactions.length > 0) {
              navigate({ to: "/sell-tokens/review", search: (prev) => prev });
            }
          },
        })
      }
    />
  );
}
