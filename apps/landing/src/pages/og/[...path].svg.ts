import type { APIContext } from 'astro';
import satori, { type SatoriOptions } from 'satori';
import { getOpenGraphImageOptions } from '../../../og-image-options.mjs';
import { renderOpenGraphImage } from '../../../og-image-renderer.mjs';
import { extractOpenGraphContent, getPagePathFromOgPath } from '../../lib/og-image';

export const prerender = false;

export async function GET({ params, request }: APIContext) {
  const pathname = getPagePathFromOgPath(params.path);
  const pageUrl = new URL(pathname, request.url);
  const pageResponse = await fetch(pageUrl);

  if (!pageResponse.ok) {
    return new Response(`Unable to load page content for ${pathname}.`, {
      status: pageResponse.status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const html = await pageResponse.text();
  const { title, description } = extractOpenGraphContent(html);
  const reactNode = await renderOpenGraphImage({
    title,
    description,
    pathname,
  });
  const options = await getOpenGraphImageOptions(request.url);
  const svg = await satori(reactNode, options as SatoriOptions);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
