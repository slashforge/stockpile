// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import aws from "astro-sst";

// https://astro.build/config
export default defineConfig({
	site: 'https://beta.soljar.xyz',
	adapter: aws(),
	integrations: [
		tailwind(),
		mdx(),
		sitemap(),
	],
});
