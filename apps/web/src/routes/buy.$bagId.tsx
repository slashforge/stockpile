import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BuyFlowProvider, FlowShell, useBuyFlow } from "@/components/trade/flows";

export const Route = createFileRoute("/buy/$bagId")({ component: BuyLayout });

const TITLES = { amount: "Buy bag", review: "Review", progress: "Buying bag" };

function Shell() {
  const { bag, close, status, slippageBps, setSlippageBps, prepare } = useBuyFlow();
  return (
    <FlowShell
      subject={bag.data}
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

function BuyLayout() {
  const { bagId } = Route.useParams();
  return (
    <BuyFlowProvider key={bagId} bagId={bagId}>
      <Shell />
    </BuyFlowProvider>
  );
}
