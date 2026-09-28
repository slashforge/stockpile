import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FlowShell, SellFlowProvider, useSellFlow } from "@/components/trade/flows";

export const Route = createFileRoute("/sell/$bagId")({ component: SellLayout });

const TITLES = { amount: "Sell bag", review: "Review sale", progress: "Selling bag" };

function Shell() {
  const { bag, close, status, slippageBps, setSlippageBps, prepare } = useSellFlow();
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

function SellLayout() {
  const { bagId } = Route.useParams();
  return (
    <SellFlowProvider key={bagId} bagId={bagId}>
      <Shell />
    </SellFlowProvider>
  );
}
