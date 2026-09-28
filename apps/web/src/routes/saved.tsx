import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { IoBookmark, IoCloudOffline, IoHeart, IoLayers, IoRefresh } from "react-icons/io5";
import { AuthGate } from "@/components/stockpile/auth-gate";
import { BagCard } from "@/components/stockpile/bag-card";
import { HeroState } from "@/components/stockpile/hero-state";
import { CardSkeleton, Page } from "@/components/ui/layout";
import { useSavedBagIds } from "@/hooks/use-account";
import { useBags } from "@/hooks/use-bags";
import { useBagReturns } from "@/hooks/use-returns";

export const Route = createFileRoute("/saved")({ component: SavedScreen });

function SavedList() {
  const saved = useSavedBagIds();
  const bags = useBags();
  const returns = useBagReturns();
  const navigate = useNavigate();

  if (saved.isPending || bags.isPending) return <CardSkeleton />;
  if (saved.isError || bags.isError) {
    return (
      <HeroState
        gradient="coral"
        icon={IoCloudOffline}
        title="Couldn’t load your saved bags"
        body={(saved.error ?? bags.error)?.message}
        actionLabel="Try again"
        actionIcon={IoRefresh}
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
        icon={IoBookmark}
        accents={[IoHeart, IoLayers]}
        title="Nothing saved yet"
        body="Tap the bookmark on any bag to keep it here."
        actionLabel="Browse bags"
        actionIcon={IoLayers}
        onAction={() => navigate({ to: "/bags" })}
      />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((bag) => (
        <BagCard key={bag.id} bag={bag} compact returns={returns.data?.[bag.id]} returnsLoading={returns.isPending} />
      ))}
    </div>
  );
}

function SavedScreen() {
  return (
    <Page title="Saved">
      <AuthGate
        gradient="mint"
        icon={IoBookmark}
        accents={[IoHeart, IoLayers]}
        title="Keep the bags you like"
        body="Sign in to save bags and find them here on any device."
      >
        <SavedList />
      </AuthGate>
    </Page>
  );
}
