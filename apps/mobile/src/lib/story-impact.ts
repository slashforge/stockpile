import type { StoryBagConnection } from "@stockpile/api-client";

type AssetLike = { symbol: string; name: string; weightBps: number };
export type ImpactSignal = "tailwind" | "headwind" | "neutral" | "mixed" | "unclear" | "unavailable";
export type StoryImpact<A extends AssetLike = AssetLike> = {
  signal: ImpactSignal;
  label: string;
  headline: string;
  holdings: A[];
  exposureBps: number;
  points: { label: string; text: string }[];
  model: string | null;
  analyzedAt: string | null;
};
const labels: Record<ImpactSignal, string> = {
  tailwind: "Potential tailwind", headwind: "Potential headwind", neutral: "No directional effect identified",
  mixed: "Mixed implications", unclear: "Impact unclear", unavailable: "Analysis unavailable",
};

/** Present validated API analysis; neither a headline nor legacy tone is an investment verdict. */
export function storyImpact<A extends AssetLike>(
  _story: { title: string; summary: string },
  bag: { id?: string; title: string; thesis?: string; assets: readonly A[] },
  connection: StoryBagConnection | undefined,
): StoryImpact<A> {
  const analysis = connection?.analysis;
  const sameBag = !bag.id || connection?.bagId === bag.id;
  const sameThesis = !bag.thesis || analysis?.thesis === bag.thesis;
  const sameHoldings = analysis?.holdings.length === bag.assets.length && bag.assets.every((asset) =>
    analysis.holdings.some((saved) => saved.symbol === asset.symbol && saved.weightBps === asset.weightBps));
  if (!analysis || analysis.version !== 1 || !sameBag || !sameThesis || !sameHoldings) {
    return { signal: "unavailable", label: labels.unavailable, headline: `Impact on ${bag.title} has not been established`,
      holdings: [], exposureBps: 0, model: null, analyzedAt: null,
      points: [{ label: "Why no verdict?", text: analysis
        ? "The bag has changed since this analysis. A fresh analysis is needed for its current thesis and holdings."
        : "No validated bag-specific analysis is available for this story. This is not a neutral verdict. Read the publisher's source before drawing an investment conclusion." }],
    };
  }
  const holdings = bag.assets.filter((asset) => analysis.affectedSymbols.includes(asset.symbol)).sort((a, b) => b.weightBps - a.weightBps);
  const exposureBps = holdings.reduce((sum, asset) => sum + asset.weightBps, 0);
  return { signal: analysis.direction, label: labels[analysis.direction], headline: analysis.headline, holdings, exposureBps,
    model: analysis.model, analyzedAt: analysis.analyzedAt,
    points: [
      { label: "What the source reports", text: analysis.whatHappened },
      { label: "Why it could matter", text: analysis.businessImpact },
      { label: "For this bag", text: analysis.bagImplication },
      { label: "Allocation, not price impact", text: holdings.length
        ? `${holdings.map((asset) => asset.symbol).join(", ")} account for ${exposureBps / 100}% of the target bag allocation. This is not an estimate of gains or losses; other holdings do not guarantee protection.`
        : "No specific holding was identified. Any connection is at the theme level, not a quantified exposure." },
      { label: "What is uncertain", text: analysis.uncertainty },
      { label: "What to watch", text: analysis.watch },
      { label: "Evidence from the supplied excerpt", text: `"${analysis.evidence}"` },
    ],
  };
}

type Counts = { tailwinds: number; headwinds: number; neutral: number; mixed: number; unclear: number; unavailable: number };
export type NewsPulse<A extends AssetLike = AssetLike> = Counts & {
  mood: string; summary: string;
  holdings: ({ asset: A } & Counts)[];
};
const emptyCounts = (): Counts => ({ tailwinds: 0, headwinds: 0, neutral: 0, mixed: 0, unclear: 0, unavailable: 0 });
const key: Record<ImpactSignal, keyof Counts> = { tailwind: "tailwinds", headwind: "headwinds", neutral: "neutral", mixed: "mixed", unclear: "unclear", unavailable: "unavailable" };

/** Counts coverage, not strength, materiality, or expected investment returns. */
export function newsPulse<A extends AssetLike>(impacts: StoryImpact<A>[], bag: { title: string }): NewsPulse<A> {
  const counts = emptyCounts();
  const byAsset = new Map<string, { asset: A } & Counts>();
  for (const impact of impacts) {
    counts[key[impact.signal]]++;
    for (const asset of impact.holdings) {
      const row = byAsset.get(asset.symbol) ?? { asset, ...emptyCounts() };
      row[key[impact.signal]]++;
      byAsset.set(asset.symbol, row);
    }
  }
  const analyzed = impacts.length - counts.unavailable;
  return { ...counts,
    mood: !impacts.length ? "No recent stories" : !analyzed ? "Analysis unavailable" : "News implications",
    summary: !impacts.length ? `No recent stories for ${bag.title}.`
      : `${analyzed} of ${impacts.length} stories have bag-specific analysis. ${counts.unavailable} unavailable. Story counts describe coverage, not the size or likelihood of any investment effect.`,
    holdings: [...byAsset.values()].sort((a, b) => b.asset.weightBps - a.asset.weightBps),
  };
}
