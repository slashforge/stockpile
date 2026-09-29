import { expect, it } from "bun:test";
import type { StoryBagConnection } from "@stockpile/api-client";
import { renderToStaticMarkup } from "react-dom/server";
import { compareLine, ImpactBreakdown, ImpactCompare, ReelImpact, UnavailableNotice } from "../src/components/stockpile/story-impact";
import { storyImpact } from "../src/lib/story-impact";

const story = { title: "Microsoft launches a record product", summary: "Microsoft news" };
const assets = [
  { symbol: "MSFTx", name: "Microsoft", weightBps: 2000, iconUrl: null },
  { symbol: "AAPLx", name: "Apple", weightBps: 1500, iconUrl: null },
];
const bag = { id: "megacap-builders", title: "Megacap Builders", thesis: "Large technology platforms", assets };
const other = { id: "ai-compute", title: "AI Compute", thesis: "Chips", assets: assets.slice(0, 1) };
const analyzed: StoryBagConnection = {
  bagId: bag.id, relationship: "direct", context: "supporting", explanation: "legacy",
  sourceExcerpt: "Excerpt.",
  analysis: { version: 1, model: "gpt-6-luna", analyzedAt: "2026-09-29T00:00:00Z", direction: "tailwind",
    headline: "Product launch could lift Microsoft demand", whatHappened: "Launch.", businessImpact: "More demand.",
    bagImplication: "Helps the bag.", uncertainty: "Pricing unknown.", watch: "Watch sales.", evidence: "Excerpt.",
    affectedSymbols: ["MSFTx"], thesis: bag.thesis, holdings: assets,
  },
};

const unavailable = storyImpact(story, bag, undefined);
const available = storyImpact(story, bag, analyzed);

it("unavailable analysis renders one honest notice: no bars, verdicts, exposure or AI attribution", () => {
  const notice = renderToStaticMarkup(<UnavailableNotice impact={unavailable} />);
  expect(notice).toContain("Analysis unavailable");
  expect(notice).toContain("No validated bag-specific analysis");
  expect(notice).not.toContain("has not been established");
  expect(notice).not.toContain("AI");

  const breakdown = renderToStaticMarkup(<ImpactBreakdown impact={unavailable} />);
  expect(breakdown).toBe(notice);

  const reel = renderToStaticMarkup(<ReelImpact impact={unavailable} />);
  expect(reel).not.toContain("Exposure not assessed");
  expect(reel).not.toContain("has not been established");
  expect(reel.match(/Analysis unavailable/g)?.length).toBe(1);
});

it("bag switcher rows carry logos, a single status line and aligned selection state", () => {
  const rows = [
    { bag, impact: unavailable },
    { bag: other, impact: storyImpact(story, other, undefined) },
  ];
  const html = renderToStaticMarkup(<ImpactCompare rows={rows} onOpen={() => {}} selectedBagId={bag.id} />);
  expect(html).not.toContain("Not assessed");
  expect(html).not.toMatch(/width:\d+%/);
  expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
  expect(html.match(/aria-pressed="false"/g)?.length).toBe(1);
  expect(html).toContain('aria-label="Megacap Builders: Analysis unavailable"');
  expect(html).toContain("MS"); // monogram from the logo cluster
});

it("assessed exposure shows a proportional bar and the affected holdings", () => {
  expect(compareLine(available)).toBe("Potential tailwind · MSFTx · 20% of bag");
  const html = renderToStaticMarkup(<ImpactCompare rows={[{ bag, impact: available }]} onOpen={() => {}} />);
  expect(html).toContain("width:20%");
  const breakdown = renderToStaticMarkup(<ImpactBreakdown impact={available} />);
  expect(breakdown).toContain("AI analysis by gpt-6-luna");
  expect(breakdown).toContain(available.headline);
});
