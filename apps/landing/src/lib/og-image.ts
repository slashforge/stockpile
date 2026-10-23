/**
 * Every prerendered page gets a static Open Graph card at build time (scripts/og.ts reads the built HTML and writes
 * dist/client/og/<page>.png). `/` -> /og/index.png, `/blog/` -> /og/blog.png, `/blog/post/` -> /og/blog/post.png.
 */
export function ogImagePath(pathname: string) {
  const trimmed = pathname.replace(/\.html$/, '').replace(/^\/+|\/+$/g, '').replace(/\/index$/, '');
  return `/og/${trimmed || 'index'}.png`;
}
