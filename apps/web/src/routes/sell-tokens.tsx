import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { FlowShell, TokenSellFlowProvider, useTokenSellFlow } from "@/components/trade/flows";

export const Route = createFileRoute("/sell-tokens")({
  component: SellTokensLayout,
  validateSearch: (search: Record<string, unknown>): { mints?: string } =>
    typeof search.mints === "string" ? { mints: search.mints } : {},
});

const TITLES = { amount: "Sell tokens", review: "Review sale", progress: "Selling tokens" };

function Shell() {
  const { subject, close, status, slippageBps, setSlippageBps, prepare } = useTokenSellFlow();
  return (
    <FlowShell
      subject={subject}
      status={status}
      close={close}
      titles={TITLES}
      slippageBps={slippageBps}
      onSlippageChange={(bps) => {
        setSlippageBps(bps);
        prepare.reset();
      }}
    >
      <Outlet />
    </FlowShell>
  );
}

function SellTokensLayout() {
  const { mints: raw } = Route.useSearch();
  const mints = useMemo(() => (raw ?? "").split(",").map((mint) => mint.trim()).filter(Boolean), [raw]);
  return (
    <TokenSellFlowProvider key={raw ?? ""} mints={mints}>
      <Shell />
    </TokenSellFlowProvider>
  );
}
