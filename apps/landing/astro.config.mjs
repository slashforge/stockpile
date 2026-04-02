// @ts-check

import * as fs from 'node:fs';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
import opengraphImages from 'astro-opengraph-images';
import aws from "astro-sst";
import { renderOpenGraphImage } from './og-image-renderer.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://__DOMAIN__',
	adapter: aws(),
	integrations: [
		tailwind(),
		mdx(),
		sitemap(),
		opengraphImages({
			options: {
				fonts: [
					{
						name: 'Atkinson',
						weight: 400,
						style: 'normal',
						data: fs.readFileSync(new URL('./public/fonts/atkinson-regular.woff', import.meta.url)),
					},
					{
						name: 'Atkinson',
						weight: 700,
						style: 'normal',
						data: fs.readFileSync(new URL('./public/fonts/atkinson-bold.woff', import.meta.url)),
					},
				],
			},
			render: renderOpenGraphImage,
		}),
	],
});
