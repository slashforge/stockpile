import { expect, it } from "bun:test";
import type { StoryBagConnection } from "@stockpile/api-client";
import { newsPulse, storyImpact } from "../src/lib/story-impact";
import { storyImpact as mobileImpact } from "../../mobile/src/lib/story-impact";

const story = { title: "Microsoft launches a record product after lawsuit", summary: "Microsoft news" };
const bag = { id: "megacap-builders", title: "Megacap Builders", thesis: "Large technology platforms", assets: [{ symbol: "MSFTx", name: "Microsoft", weightBps: 2000 }] };
const connection: StoryBagConnection = {
  bagId: bag.id, relationship: "direct", context: "supporting", explanation: "legacy stance",
  sourceExcerpt: "Groups ask Microsoft for community contributions.",
  analysis: { version: 1, model: "gpt-6-luna", analyzedAt: "2026-09-29T00:00:00Z", direction: "headwind",
    headline: "Community requests could add construction costs", whatHappened: "Groups asked Microsoft for contributions.",
    businessImpact: "Accepting could add costs but help local acceptance.", bagImplication: "Microsoft's expansion faces possible cost pressure.",
    uncertainty: "No agreement or project budget is supplied.", watch: "Watch for Microsoft's response and permitting decisions.",
    evidence: "Groups ask Microsoft for community contributions.", affectedSymbols: ["MSFTx"], thesis: bag.thesis, holdings: bag.assets,
  },
};

it("uses API analysis rather than legacy context or headline keywords", () => {
  const impact = storyImpact(story, bag, connection);
  expect(impact.signal).toBe("headwind");
  expect(impact.exposureBps).toBe(2000);
  expect(impact.points.map((p) => p.text)).toContain(connection.analysis!.businessImpact);
  expect(impact.points.some((p) => p.text.includes("do not guarantee protection"))).toBe(true);
  expect(impact.points.at(-1)?.text).toContain(connection.analysis!.evidence);
  expect(mobileImpact(story, bag, connection)).toEqual(impact);
});

it("missing, old and stale analyses are unavailable, never neutral", () => {
  for (const c of [undefined, { ...connection, analysis: undefined }, { ...connection, analysis: null }]) {
    expect(storyImpact(story, bag, c).signal).toBe("unavailable");
  }
  expect(storyImpact(story, { ...bag, thesis: "A new thesis" }, connection).signal).toBe("unavailable");
  expect(storyImpact(story, { ...bag, assets: [{ ...bag.assets[0]!, weightBps: 2500 }] }, connection).signal).toBe("unavailable");
  expect(storyImpact(story, { ...bag, id: "different-bag" }, connection).signal).toBe("unavailable");
});

it("keeps mixed, unclear and unavailable separate from neutral in aggregate coverage", () => {
  const signals = ["mixed", "unclear", "neutral", "tailwind", "headwind"] as const;
  const impacts = signals.map((direction) => storyImpact(story, bag, { ...connection, analysis: { ...connection.analysis!, direction } }));
  impacts.push(storyImpact(story, bag, undefined));
  const pulse = newsPulse(impacts, bag);
  expect(pulse).toMatchObject({ mixed: 1, unclear: 1, neutral: 1, unavailable: 1, tailwinds: 1, headwinds: 1 });
  expect(pulse.summary).toContain("5 of 6");
  expect(newsPulse([storyImpact(story, bag, undefined)], bag).mood).toBe("Analysis unavailable");
});
