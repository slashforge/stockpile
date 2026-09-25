/**
 * Bag catalogue for the landing page.
 *
 * At build time we try the Stockpile API (`LANDING_API_URL`, default
 * http://localhost:4040). If it is unreachable we fall back to a static
 * snapshot of the same twelve bags. Only composition metadata is used —
 * never prices — so a stale snapshot is still truthful.
 */

export type Issuer = 'xstocks' | 'prestocks';
export type SourceType = 'editorial' | 'disclosure';
export type CuratorKind = 'person' | 'aggregate' | 'editorial';

export interface LandingAsset {
  symbol: string;
  name: string;
  weightBps: number;
  iconUrl: string | null;
  brandColor: string | null;
  evidenceCount: number;
}

export interface LandingBag {
  id: string;
  title: string;
  subtitle: string;
  sourceType: SourceType;
  issuer: Issuer;
  curator: { kind: CuratorKind; name: string };
  tradable: boolean;
  tradableReason: string | null;
  assets: LandingAsset[];
}

export interface BagCatalogue {
  bags: LandingBag[];
  source: 'live' | 'static';
  fetchedAt: string | null;
}

const XSTOCKS_LOGO = (symbol: string) => `https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`;
const PRESTOCKS_LOGO = (slug: string) => `https://prestocks.com/logos/${slug}.png`;

const x = (symbol: string, name: string, weightBps: number, brandColor: string): LandingAsset => ({
  symbol,
  name,
  weightBps,
  iconUrl: XSTOCKS_LOGO(symbol),
  brandColor,
  evidenceCount: 0,
});

const p = (symbol: string, slug: string, name: string, weightBps: number, brandColor: string): LandingAsset => ({
  symbol,
  name,
  weightBps,
  iconUrl: PRESTOCKS_LOGO(slug),
  brandColor,
  evidenceCount: 0,
});

const editorial = { kind: 'editorial' as const, name: 'Stockpile Editorial' };

/** Static snapshot of the catalogue (composition only; weights are editorial). */
export const STATIC_BAGS: LandingBag[] = [
  {
    id: 'megacap-builders',
    title: 'Megacap Builders',
    subtitle: 'Platforms behind everyday computing',
    sourceType: 'editorial',
    issuer: 'xstocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      x('NVDAx', 'NVIDIA xStock', 2000, '#78b808'),
      x('AAPLx', 'Apple xStock', 1800, '#1a1a1a'),
      x('MSFTx', 'Microsoft xStock', 1800, '#fdb92c'),
      x('GOOGLx', 'Alphabet xStock', 1400, '#f71603'),
      x('AMZNx', 'Amazon xStock', 1200, '#f89808'),
      x('METAx', 'Meta Platforms xStock', 1200, '#0866ff'),
      x('TSLAx', 'Tesla xStock', 600, '#ef0027'),
    ],
  },
  {
    id: 'ai-infrastructure',
    title: 'AI Infrastructure',
    subtitle: 'Hardware, platforms, and compute',
    sourceType: 'editorial',
    issuer: 'xstocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      x('NVDAx', 'NVIDIA xStock', 2400, '#78b808'),
      x('MSFTx', 'Microsoft xStock', 1400, '#fdb92c'),
      x('GOOGLx', 'Alphabet xStock', 1200, '#f71603'),
      x('AMZNx', 'Amazon xStock', 1000, '#f89808'),
      x('PLTRx', 'Palantir xStock', 1000, '#101113'),
      x('AVGOx', 'Broadcom xStock', 1000, '#cc092f'),
      x('AMDx', 'AMD xStock', 1000, '#1a1a1a'),
      x('INTCx', 'Intel xStock', 1000, '#0068b5'),
    ],
  },
  {
    id: 'consumer-frontiers',
    title: 'Consumer Frontiers',
    subtitle: 'Commerce, mobility, media, and consumer finance',
    sourceType: 'editorial',
    issuer: 'xstocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      x('AMZNx', 'Amazon xStock', 2200, '#f89808'),
      x('TSLAx', 'Tesla xStock', 2200, '#ef0027'),
      x('METAx', 'Meta Platforms xStock', 1600, '#0866ff'),
      x('NFLXx', 'Netflix xStock', 1200, '#b1060f'),
      x('MCDx', "McDonald's xStock", 1200, '#ffbc0d'),
      x('WMTx', 'Walmart xStock', 800, '#0071ce'),
      x('HOODx', 'Robinhood xStock', 800, '#00c805'),
    ],
  },
  {
    id: 'crypto-fintech-rails',
    title: 'Crypto & Fintech Rails',
    subtitle: 'Exchanges, stablecoins, treasuries, and consumer fintech',
    sourceType: 'editorial',
    issuer: 'xstocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      x('COINx', 'Coinbase xStock', 2600, '#0052ff'),
      x('HOODx', 'Robinhood xStock', 2400, '#00c805'),
      x('MSTRx', 'Strategy xStock', 2200, '#e8471c'),
      x('CRCLx', 'Circle xStock', 2200, '#00d395'),
      x('BACx', 'Bank of America xStock', 600, '#e31837'),
    ],
  },
  {
    id: 'cloud-software',
    title: 'Cloud & Software',
    subtitle: 'Hyperscale cloud and enterprise data platforms',
    sourceType: 'editorial',
    issuer: 'xstocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      x('MSFTx', 'Microsoft xStock', 2800, '#fdb92c'),
      x('GOOGLx', 'Alphabet xStock', 2200, '#f71603'),
      x('AMZNx', 'Amazon xStock', 2200, '#f89808'),
      x('PLTRx', 'Palantir xStock', 2000, '#101113'),
      x('ORCLx', 'Oracle xStock', 800, '#c74634'),
    ],
  },
  {
    id: 'everyday-brands',
    title: 'Everyday Brands',
    subtitle: 'Consumer staples: food, drinks, and household goods',
    sourceType: 'editorial',
    issuer: 'xstocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      x('MCDx', "McDonald's xStock", 2800, '#ffbc0d'),
      x('WMTx', 'Walmart xStock', 2400, '#0071ce'),
      x('KOx', 'Coca-Cola xStock', 2400, '#f40009'),
      x('PGx', 'Procter & Gamble xStock', 1400, '#003da5'),
      x('PEPx', 'PepsiCo xStock', 1000, '#004b93'),
    ],
  },
  {
    id: 'index-basics',
    title: 'Index Basics',
    subtitle: 'The market in three tokens',
    sourceType: 'editorial',
    issuer: 'xstocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      x('SPYx', 'SPDR S&P 500 ETF xStock', 5000, '#0b3d91'),
      x('QQQx', 'Invesco QQQ xStock', 3000, '#0056a3'),
      x('GLDx', 'SPDR Gold Shares xStock', 2000, '#c9a227'),
    ],
  },
  {
    id: 'frontier-ai-labs',
    title: 'Frontier AI Labs',
    subtitle: 'Pre-IPO exposure to model, robotics, and neural-interface labs',
    sourceType: 'editorial',
    issuer: 'prestocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      p('OPENAI', 'openai', 'OpenAI PreStocks', 3500, '#0ea982'),
      p('ANTHROPIC', 'anthropic', 'Anthropic PreStocks', 3500, '#ba8f70'),
      p('FIGUREAI', 'figureai', 'Figure AI PreStocks', 1500, '#000000'),
      p('NEURALINK', 'neuralink', 'Neuralink PreStocks', 1500, '#010101'),
    ],
  },
  {
    id: 'prediction-markets',
    title: 'Prediction Markets',
    subtitle: 'Pre-IPO exposure to event-contract venues',
    sourceType: 'editorial',
    issuer: 'prestocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      p('KALSHI', 'kalshi', 'Kalshi PreStocks', 5000, '#08c386'),
      p('POLYMARKET', 'polymarket', 'Polymarket PreStocks', 5000, '#2f5cff'),
    ],
  },
  {
    id: 'defense-space',
    title: 'Defense & Space',
    subtitle: 'Pre-IPO exposure to launch and autonomous defense',
    sourceType: 'editorial',
    issuer: 'prestocks',
    curator: editorial,
    tradable: true,
    tradableReason: null,
    assets: [
      p('SPACEX', 'spacex', 'SpaceX PreStocks', 6000, '#054b83'),
      p('ANDURIL', 'anduril', 'Anduril PreStocks', 4000, '#000000'),
    ],
  },
  {
    id: 'pelosi-tracker',
    title: 'Pelosi Tracker',
    subtitle: 'Purchases disclosed by Rep. Nancy Pelosi in the last 12 months',
    sourceType: 'disclosure',
    issuer: 'xstocks',
    curator: { kind: 'person', name: 'Nancy Pelosi' },
    tradable: false,
    tradableReason: 'Research-only until at least two disclosed tickers overlap tradable xStocks.',
    assets: [],
  },
  {
    id: 'congress-consensus',
    title: 'Congress Consensus',
    subtitle: 'Net-most-bought tickers across all members, last 90 days',
    sourceType: 'disclosure',
    issuer: 'xstocks',
    curator: { kind: 'aggregate', name: 'U.S. Congress (all members)' },
    tradable: false,
    tradableReason: 'Composition is computed from STOCK Act filings at request time.',
    assets: [],
  },
];

interface ApiAsset {
  symbol: string;
  name: string;
  weightBps: number;
  iconUrl: string | null;
  brandColor: string | null;
  evidence?: unknown[];
}

interface ApiBag {
  id: string;
  title: string;
  subtitle: string;
  sourceType: SourceType;
  issuer: Issuer;
  curator: { kind: CuratorKind; name: string };
  tradable: boolean;
  tradableReason: string | null;
  assets: ApiAsset[];
}

function isHttpsUrl(value: string | null): value is string {
  return typeof value === 'string' && value.startsWith('https://');
}

function normalise(bag: ApiBag): LandingBag {
  return {
    id: bag.id,
    title: bag.title,
    subtitle: bag.subtitle,
    sourceType: bag.sourceType,
    issuer: bag.issuer,
    curator: { kind: bag.curator.kind, name: bag.curator.name },
    tradable: bag.tradable,
    tradableReason: bag.tradableReason,
    assets: bag.assets.map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      weightBps: asset.weightBps,
      iconUrl: isHttpsUrl(asset.iconUrl) ? asset.iconUrl : null,
      brandColor: asset.brandColor,
      evidenceCount: Array.isArray(asset.evidence) ? asset.evidence.length : 0,
    })),
  };
}

export async function loadBagCatalogue(): Promise<BagCatalogue> {
  const base = (import.meta.env.LANDING_API_URL ?? 'http://localhost:4040').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${base}/bags`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { bags?: ApiBag[] };
    const bags = Array.isArray(payload.bags) ? payload.bags.map(normalise) : [];
    if (bags.length === 0) throw new Error('empty catalogue');
    return { bags, source: 'live', fetchedAt: new Date().toISOString() };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[landing] bag catalogue: using static fallback (${reason})`);
    return { bags: STATIC_BAGS, source: 'static', fetchedAt: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback palette (mobile `theme.chart`) when a token has no brand colour. */
export const CHART_PALETTE = ['#2563EB', '#FF7A66', '#22C29A', '#0E9AB5', '#FFB23F', '#2FA8E8', '#FF6FA3', '#64748B'];

export const BAG_GRADIENTS: Record<string, string> = {
  'megacap-builders': 'bg-grad-blue',
  'ai-infrastructure': 'bg-grad-mint',
  'consumer-frontiers': 'bg-grad-coral',
  'crypto-fintech-rails': 'bg-grad-sky',
  'cloud-software': 'bg-grad-rose',
  'everyday-brands': 'bg-grad-mint',
  'index-basics': 'bg-grad-blue',
  'frontier-ai-labs': 'bg-grad-rose',
  'prediction-markets': 'bg-grad-sky',
  'defense-space': 'bg-grad-blue',
  'pelosi-tracker': 'bg-grad-coral',
  'congress-consensus': 'bg-grad-mint',
};

export function monogram(symbol: string) {
  return symbol.replace(/x$/, '').slice(0, 2).toUpperCase();
}

export function formatWeight(weightBps: number) {
  return `${Math.round(weightBps / 100)}%`;
}
