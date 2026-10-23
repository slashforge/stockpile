// Post-build: render a static Open Graph card for every prerendered page (runs after `astro build`).
// Reads og:title / og:description from dist/client/**/*.html and writes dist/client/og/<page>.png, the path
// BaseHead points og:image at (src/lib/og-image.ts). Cards come from functions/og, shared with the web app.
// Usage: bun scripts/og.ts [distDir=dist/client]
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { HomeCard, PageCard } from '../../../functions/og/cards';
import { cardAssets } from '../../../functions/og/data';
import { renderPng } from '../../../functions/og/render';
import { ogImagePath } from '../src/lib/og-image';
import { loadBagCatalogue } from '../src/lib/bags';

const dist = process.argv[2] ?? 'dist/client';
const HOST = 'newsbid.trade';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" };
const decode = (value: string) => value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => ENTITIES[body.toLowerCase()] ?? match);

function meta(html: string, key: string) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i'))?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : undefined;
}

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'og' || entry.name === '_astro' ? [] : htmlFiles(path);
      return entry.name.endsWith('.html') ? [path] : [];
    }),
  );
  return nested.flat();
}

const section = (pathname: string) =>
  pathname.startsWith('/blog') ? 'The Journal' : /^\/(disclosures|privacy|terms)/.test(pathname) ? 'Legal' : 'Newsbid';
const cleanTitle = (title: string) => title.replace(/\s*[|—–-]\s*Newsbid$/i, '').replace(/^Newsbid\s*[|—–-]\s*/i, '');
const formatDate = (iso: string | undefined) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined;
};

async function homeBag() {
  const { bags } = await loadBagCatalogue();
  const bag = bags.find((b) => b.id === 'consumer-frontiers') ?? bags.find((b) => b.assets.length > 2);
  return bag ? { title: bag.title, assets: await cardAssets(bag.assets, 3) } : undefined;
}

const files = await htmlFiles(dist);
let written = 0;
for (const file of files) {
  const html = await readFile(file, 'utf8');
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) continue;
  const rel = relative(dist, file).split('\\').join('/');
  const pathname = `/${rel.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')}`;
  const out = join(dist, ogImagePath(pathname));
  const url = `${HOST}${pathname === '/' ? '' : pathname.replace(/\/$/, '')}`;

  const node =
    pathname === '/'
      ? HomeCard({ url, bag: await homeBag() })
      : PageCard({
          section: section(pathname),
          kicker: formatDate(meta(html, 'article:published_time')),
          title: pathname === '/blog/' ? 'The Journal' : cleanTitle(meta(html, 'og:title') ?? 'Newsbid'),
          description: meta(html, 'og:description'),
          url,
        });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await renderPng(node));
  written++;
  console.log(`[og] ${pathname} -> ${relative(dist, out)}`);
}
console.log(`[og] wrote ${written} cards`);
