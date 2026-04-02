import { Resvg } from '@resvg/resvg-js';
import type { APIContext } from 'astro';
import satori from 'satori';
import { openGraphImageOptions } from '../../../og-image-options.mjs';
import { renderOpenGraphImage } from '../../../og-image-renderer.mjs';
import { extractOpenGraphContent, getDevOpenGraphImagePath, getPagePathFromOgPath } from '../../lib/og-image';

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
  const imageUrl = new URL(getDevOpenGraphImagePath(pathname), request.url).toString();
  const reactNode = await renderOpenGraphImage({
    title,
    description,
    pathname,
    url: pageUrl.toString(),
    type: 'website',
    image: imageUrl,
  });
  const svg = await satori(reactNode, openGraphImageOptions);
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: false },
    fitTo: { mode: 'width', value: openGraphImageOptions.width },
  });

  return new Response(resvg.render().asPng(), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  });
}
