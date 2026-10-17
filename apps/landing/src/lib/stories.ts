/**
 * Story samples for the landing page, fetched from the Newsbid API at build time.
 * Only stories whose bag analysis still matches the bag's current holdings are used, so the
 * page never shows a connection the app itself would reject. Falls back to a fixed snapshot.
 */
import type { LandingBag } from './bags';

export type Signal = 'tailwind' | 'headwind' | 'neutral' | 'mixed' | 'unclear';

export interface LandingStory {
  id: string;
  title: string;
  summary: string;
  publisher: string;
  publishedAt: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  provenance: string | null;
  bagId: string;
  analysis: {
    direction: Signal;
    headline: string;
    affectedSymbols: string[];
    bagImplication: string;
    uncertainty: string;
  };
}

export const SIGNAL_LABEL: Record<Signal, string> = {
  tailwind: 'Potential tailwind',
  headwind: 'Potential headwind',
  neutral: 'No directional effect identified',
  mixed: 'Mixed implications',
  unclear: 'Impact unclear',
};

const STATIC_STORIES: LandingStory[] = [
  {
    id: '40a90eb8be7fcc452d6ec74720c5efb0',
    title: "Apple's $1,999 iPhone Duo puts the company's status-symbol power to the test",
    summary:
      "CNBC Technology reports early demand for Apple's $1,999 iPhone Duo, while analysts assess whether the foldable can lift iPhone pricing and revenue.",
    publisher: 'CNBC Technology',
    publishedAt: '2026-10-16T18:55:17.000Z',
    sourceUrl: 'https://www.cnbc.com/2026/10/16/apple-iphone-duo-demand-price.html',
    imageUrl: null,
    provenance: 'ai',
    bagId: 'megacap-builders',
    analysis: {
      direction: 'tailwind',
      headline: 'Early demand could give Apple a premium-priced iPhone opportunity, if it holds up',
      affectedSymbols: ['AAPLx'],
      bagImplication:
        'Apple is represented by AAPLx in this bag, so a durable improvement in iPhone pricing or revenue could be relevant to that holding. The excerpt does not establish an effect on the bag\u2019s other companies.',
      uncertainty:
        'The excerpt does not say how early demand is measured, how many devices Apple may sell, or whether demand will persist.',
    },
  },
  {
    id: 'a9bfc73b70d7a162c0116a1f0cf0ea54',
    title: 'Bug turns one of the biggest fears about Ray-Ban Meta smart glasses into reality',
    summary:
      'Ars Technica reports that a bug in Ray-Ban Meta smart glasses was fixed, while privacy concerns remain.',
    publisher: 'Ars Technica',
    publishedAt: '2026-10-16T19:11:50.000Z',
    sourceUrl:
      'https://arstechnica.com/gadgets/2026/10/ray-ban-meta-smart-glasses-found-recording-audio-without-wearers-consent/',
    imageUrl: null,
    provenance: 'ai',
    bagId: 'megacap-builders',
    analysis: {
      direction: 'headwind',
      headline: 'Lingering privacy concerns could make adoption of Meta\u2019s smart glasses harder',
      affectedSymbols: ['METAx'],
      bagImplication:
        'This bag holds METAx, so any effect on Meta\u2019s device adoption would be relevant to that holding. The excerpt does not show how significant the glasses are to Meta\u2019s business.',
      uncertainty:
        'The excerpt gives no details about the bug, how many users were affected, or any change in customer demand or scrutiny.',
    },
  },
];

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

interface ApiStory {
  id: string;
  title: string;
  summary: string;
  publisher: string;
  publishedAt: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  provenance: string | null;
  bagConnections: {
    bagId: string;
    analysis: null | {
      version: number;
      direction: Signal;
      headline: string;
      affectedSymbols: string[];
      bagImplication: string;
      uncertainty: string;
      holdings: { symbol: string; weightBps: number }[];
    };
  }[];
}

/** Same freshness rule as the app: the analysis must describe the bag's current holdings. */
function pick(story: ApiStory, bags: Map<string, LandingBag>): LandingStory | null {
  for (const connection of story.bagConnections ?? []) {
    const analysis = connection.analysis;
    const bag = bags.get(connection.bagId);
    if (!analysis || analysis.version !== 1 || !bag || !bag.assets.length) continue;
    const current =
      analysis.holdings.length === bag.assets.length &&
      bag.assets.every((asset) => analysis.holdings.some((h) => h.symbol === asset.symbol && h.weightBps === asset.weightBps));
    if (!current || !analysis.affectedSymbols.length) continue;
    return {
      id: story.id,
      title: decode(story.title),
      summary: decode(story.summary),
      publisher: decode(story.publisher),
      publishedAt: story.publishedAt,
      sourceUrl: story.sourceUrl,
      imageUrl: story.imageUrl?.startsWith('https://') ? story.imageUrl : null,
      provenance: story.provenance,
      bagId: bag.id,
      analysis: {
        direction: analysis.direction,
        headline: decode(analysis.headline),
        affectedSymbols: analysis.affectedSymbols,
        bagImplication: decode(analysis.bagImplication),
        uncertainty: decode(analysis.uncertainty),
      },
    };
  }
  return null;
}

export async function loadStories(bags: LandingBag[]): Promise<{ stories: LandingStory[]; source: 'live' | 'static' }> {
  const base = (import.meta.env.PUBLIC_API_URL ?? 'http://localhost:4040').replace(/\/$/, '');
  const byId = new Map(bags.map((bag) => [bag.id, bag]));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${base}/stories?limit=20`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { stories?: ApiStory[] };
    const stories = (payload.stories ?? []).map((story) => pick(story, byId)).filter((s): s is LandingStory => !!s);
    const directional = stories.filter((s) => s.analysis.direction === 'tailwind' || s.analysis.direction === 'headwind');
    if (directional.length < 2) throw new Error('not enough analysed stories');
    return { stories: directional, source: 'live' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[landing] stories: using static fallback (${reason})`);
    return { stories: STATIC_STORIES.filter((s) => byId.has(s.bagId)), source: 'static' };
  } finally {
    clearTimeout(timer);
  }
}

export function storyHost(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function storyDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
