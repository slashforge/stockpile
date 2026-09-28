import { createFileRoute } from "@tanstack/react-router";
import { IoCloudOffline, IoLayers, IoNewspaper, IoRefresh, IoSparkles } from "react-icons/io5";
import { BagCard } from "@/components/stockpile/bag-card";
import { HeroState } from "@/components/stockpile/hero-state";
import { CardSkeleton, Page } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { useBags } from "@/hooks/use-bags";
import { useBagReturns } from "@/hooks/use-returns";

export const Route = createFileRoute("/bags")({ component: BagsScreen });

function BagsScreen() {
  const bags = useBags();
  const returns = useBagReturns();
  const count = bags.data?.length ?? 0;

  return (
    <Page
      title="Bags"
      wide
      subtitle={count > 0 ? `${count} themed ${count === 1 ? "bag" : "bags"} of tokenized stocks and pre-IPO tokens` : undefined}
    >
      {bags.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : bags.isError ? (
        <div className="mx-auto w-full max-w-[640px]">
          <HeroState
            gradient="coral"
            icon={IoCloudOffline}
            accents={[IoRefresh]}
            title="Couldn’t load bags"
            body={bags.error.message}
            actionLabel="Try again"
            actionIcon={IoRefresh}
            onAction={() => bags.refetch()}
          />
        </div>
      ) : count === 0 ? (
        <div className="mx-auto w-full max-w-[640px]">
          <HeroState
            gradient="rose"
            icon={IoLayers}
            accents={[IoSparkles, IoNewspaper]}
            title="No bags yet"
            body="New bags show up here as soon as they’re published."
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {bags.data.map((bag) => (
              <BagCard key={bag.id} bag={bag} returns={returns.data?.[bag.id]} returnsLoading={returns.isPending} />
            ))}
          </div>
          <T variant="caption" tone="tertiary" align="center" className="mt-2">
            Editorial research, not investment advice.
          </T>
        </>
      )}
    </Page>
  );
}
