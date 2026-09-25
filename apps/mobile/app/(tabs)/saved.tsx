import { router } from "expo-router";
import { AuthGate } from "@/components/stockpile/auth-gate";
import { BagCard } from "@/components/stockpile/bag-card";
import { HeroState } from "@/components/stockpile/hero-state";
import { CardSkeleton, Screen } from "@/components/stockpile/layout";
import { useSavedBagIds } from "@/hooks/use-account";
import { useBags } from "@/hooks/use-bags";
import { useBagReturns } from "@/hooks/use-returns";
import { useStockpileAuth } from "@/providers/auth-context";

function SavedList() {
  const saved = useSavedBagIds();
  const bags = useBags();
  const returns = useBagReturns();

  if (saved.isPending || bags.isPending) return <CardSkeleton />;
  if (saved.isError || bags.isError) {
    return (
      <HeroState
        gradient="coral"
        icon="cloud-offline"
        title="Couldn’t load your saved bags"
        body={(saved.error ?? bags.error)?.message}
        actionLabel="Try again"
        actionIcon="refresh"
        onAction={() => {
          saved.refetch();
          bags.refetch();
        }}
      />
    );
  }

  const byId = new Map(bags.data.map((bag) => [bag.id, bag]));
  const items = saved.data.map((id) => byId.get(id)).filter((bag) => !!bag);

  if (items.length === 0) {
    return (
      <HeroState
        gradient="mint"
        icon="bookmark"
        accents={["heart", "layers"]}
        title="Nothing saved yet"
        body="Tap the bookmark on any bag to keep it here."
        actionLabel="Browse bags"
        actionIcon="layers"
        onAction={() => router.navigate("/bags")}
      />
    );
  }
  return (
    <>
      {items.map((bag) => (
        <BagCard
          key={bag.id}
          bag={bag}
          compact
          returns={returns.data?.[bag.id]}
          returnsLoading={returns.isPending}
        />
      ))}
    </>
  );
}

export default function SavedScreen() {
  const saved = useSavedBagIds();
  const { authenticated } = useStockpileAuth();
  return (
    <Screen title="Saved" onRefresh={authenticated ? () => saved.refetch() : undefined}>
      <AuthGate
        gradient="mint"
        icon="bookmark"
        accents={["heart", "layers"]}
        title="Keep the bags you like"
        body="Sign in to save bags and find them here on any device."
      >
        <SavedList />
      </AuthGate>
    </Screen>
  );
}
