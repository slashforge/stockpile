import { StyleSheet } from "react-native-unistyles";
import { BagCard } from "@/components/stockpile/bag-card";
import { HeroState } from "@/components/stockpile/hero-state";
import { CardSkeleton, Screen } from "@/components/stockpile/layout";
import { T } from "@/components/stockpile/type";
import { useBags } from "@/hooks/use-bags";

export default function BagsScreen() {
  const bags = useBags();
  const count = bags.data?.length ?? 0;

  return (
    <Screen
      title="Bags"
      subtitle={count > 0 ? `${count} themed ${count === 1 ? "bag" : "bags"} of tokenized stocks and pre-IPO tokens` : undefined}
      onRefresh={() => bags.refetch()}
    >
      {bags.isPending ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : bags.isError ? (
        <HeroState
          gradient="coral"
          icon="cloud-offline"
          accents={["refresh"]}
          title="Couldn’t load bags"
          body={bags.error.message}
          actionLabel="Try again"
          actionIcon="refresh"
          onAction={() => bags.refetch()}
        />
      ) : count === 0 ? (
        <HeroState
          gradient="rose"
          icon="layers"
          accents={["sparkles", "newspaper"]}
          title="No bags yet"
          body="New bags show up here as soon as they’re published."
        />
      ) : (
        <>
          {bags.data.map((bag) => (
            <BagCard key={bag.id} bag={bag} />
          ))}
          <T variant="caption" tone="tertiary" align="center" style={styles.footnote}>
            Editorial research, not investment advice.
          </T>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footnote: { marginTop: 4 },
});
