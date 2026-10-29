import {
	createCommitDateReader,
	createSitemapLastmodWriter,
} from '@xsynaptic/astro-sitemap-lastmod/write';
import { sitemapLastmodPath } from '@xsynaptic/shared/constants';
import { getContentPath } from '@xsynaptic/shared/routing';
import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';

import { contentCollectionsPath } from '#constants.ts';
import { downloadsLoader } from '#lib/collections/downloads/downloads-loader.ts';
import { mixSchema, reviewSchema } from '#lib/schemas/audio.ts';
import { pageSchema, postSchema } from '#lib/schemas/documents.ts';
import { downloadStatsSchema } from '#lib/schemas/downloads.ts';
import {
	artistSchema,
	eraSchema,
	labelSchema,
	regionSchema,
	seriesSchema,
	styleSchema,
	themeSchema,
} from '#lib/schemas/terms.ts';

const sitemapLastmodWriter = createSitemapLastmodWriter({ filePath: sitemapLastmodPath });
const readCommitDates = createCommitDateReader({ rootPath: process.cwd() });

function collectionLoader(name: string) {
	const loader = glob({
		base: `${contentCollectionsPath}/${name}`,
		generateId: ({ entry }) => entry.replace(/^.*\//, '').replace(/\.(md|mdx)$/, ''),
		pattern: '**/[^_]*.(md|mdx)',
	});

	return sitemapLastmodWriter.wrap(loader, async (entries) => {
		const dates = await readCommitDates(entries);

		return entries.map((entry) => [
			getContentPath(name, entry.id),
			dates.get(entry.filePath ?? ''),
		]);
	});
}

export const collections = {
	artists: defineCollection({ loader: collectionLoader('artists'), schema: artistSchema }),
	downloads: defineCollection({ loader: downloadsLoader(), schema: downloadStatsSchema }),
	eras: defineCollection({ loader: collectionLoader('eras'), schema: eraSchema }),
	labels: defineCollection({ loader: collectionLoader('labels'), schema: labelSchema }),
	mixes: defineCollection({ loader: collectionLoader('mixes'), schema: mixSchema }),
	pages: defineCollection({ loader: collectionLoader('pages'), schema: pageSchema }),
	posts: defineCollection({ loader: collectionLoader('posts'), schema: postSchema }),
	regions: defineCollection({ loader: collectionLoader('regions'), schema: regionSchema }),
	reviews: defineCollection({ loader: collectionLoader('reviews'), schema: reviewSchema }),
	series: defineCollection({ loader: collectionLoader('series'), schema: seriesSchema }),
	styles: defineCollection({ loader: collectionLoader('styles'), schema: styleSchema }),
	themes: defineCollection({ loader: collectionLoader('themes'), schema: themeSchema }),
};
