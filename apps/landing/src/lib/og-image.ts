function normalizePathname(pathname: string) {
  if (!pathname) return '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getMetaContent(html: string, key: string, attribute: 'name' | 'property') {
  const patterns = [
    new RegExp(`<meta[^>]*${attribute}=["']${key}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attribute}=["']${key}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return undefined;
}

function getDocumentTitle(html: string) {
  const match = html.match(/<title>(.*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]) : undefined;
}

export function getDevOpenGraphImagePath(pathname: string) {
  const normalized = normalizePathname(pathname);

  if (normalized === '/') return '/og/index.png';
  if (normalized.endsWith('/')) return `/og${normalized}index.png`;
  return `/og${normalized}.png`;
}

export function getPagePathFromOgPath(path?: string) {
  if (!path || path === 'index') return '/';

  const normalized = path.startsWith('/') ? path.slice(1) : path;

  if (normalized.endsWith('/index')) {
    const basePath = normalized.slice(0, -'/index'.length);
    return basePath ? `/${basePath}/` : '/';
  }

  return `/${normalized}`;
}

export function extractOpenGraphContent(html: string) {
  return {
    title: getMetaContent(html, 'og:title', 'property') ?? getDocumentTitle(html) ?? 'Untitled Page',
    description:
      getMetaContent(html, 'og:description', 'property') ??
      getMetaContent(html, 'description', 'name') ??
      '',
  };
}
