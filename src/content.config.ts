import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';

import { CONTENT_COLLECTIONS_PATH } from '#constants.ts';
import { downloadsLoader } from '#lib/collections/downloads/downloads-loader.ts';
import { mixSchema, reviewSchema } from '#lib/schemas/audio.ts';
import { pageSchema, postSchema } from '#lib/schemas/documents.ts';
import { downloadStatsSchema } from '#lib/schemas/downloads.ts';
import {
	artistSchema,
	eraSchema,
	formatSchema,
	labelSchema,
	regionSchema,
	seriesSchema,
	styleSchema,
	themeSchema,
} from '#lib/schemas/terms.ts';

function collectionLoader(name: string) {
	return glob({
		base: `${CONTENT_COLLECTIONS_PATH}/${name}`,
		generateId: ({ entry }) => entry.replace(/^.*\//, '').replace(/\.(md|mdx)$/, ''),
		pattern: '**/[^_]*.(md|mdx)',
	});
}

export const collections = {
	artists: defineCollection({ loader: collectionLoader('artists'), schema: artistSchema }),
	downloads: defineCollection({ loader: downloadsLoader(), schema: downloadStatsSchema }),
	eras: defineCollection({ loader: collectionLoader('eras'), schema: eraSchema }),
	formats: defineCollection({ loader: collectionLoader('formats'), schema: formatSchema }),
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
