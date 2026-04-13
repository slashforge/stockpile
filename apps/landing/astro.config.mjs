// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import opengraphImages from 'astro-opengraph-images';
import aws from "astro-sst";
import { openGraphImageOptions } from './og-image-options.mjs';
import { renderOpenGraphImage } from './og-image-renderer.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://stackforge.xyz',
	adapter: aws(),
	integrations: [
		tailwind(),
		mdx(),
		sitemap(),
		opengraphImages({
			options: openGraphImageOptions,
			render: renderOpenGraphImage,
		}),
	],
});
