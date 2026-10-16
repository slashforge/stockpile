// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://newsbid.trade',
	adapter: cloudflare({
		configPath: process.env.SST_WRANGLER_PATH,
	}),
	integrations: [
		tailwind(),
		mdx(),
		sitemap(),
	],
});
