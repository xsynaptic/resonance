import { getContentUrl } from '@xsynaptic/shared/routing';

import type { DataStoreCollections } from '../shared/data-store.js';

import { getDataStoreCollection, toFormerIds } from '../shared/data-store.js';

// Terms carry no formerIds: their slugs never changed, only the base path they sit under
const redirectCollections = ['mixes', 'pages', 'posts', 'reviews'];

export interface RedirectBuild {
	// A former id matching a live path; fatal, because a rule takes that page off the site
	collisions: Array<string>;
	pairs: Array<RedirectPair>;
	skipped: Array<string>;
}

interface RedirectPair {
	from: string;
	to: string;
}

// Drafts never reach the data store, so an old slug starts redirecting when its draft is triaged
export function buildRedirectPairs(collections: DataStoreCollections): RedirectBuild {
	const livePaths = collectLivePaths(collections);
	const claimed = new Set<string>();
	const collisions: Array<string> = [];
	const pairs: Array<RedirectPair> = [];
	const skipped: Array<string> = [];

	for (const { from, to } of collectCandidates(collections)) {
		// Cloudflare follows a redirect whether or not an asset sits at the path, so this is a bug
		if (livePaths.has(from)) {
			collisions.push(`${from} is a live page`);
			continue;
		}
		// First claim wins, which is a real answer rather than a defect
		if (claimed.has(from)) {
			skipped.push(`${from} is claimed by an earlier rule`);
			continue;
		}

		claimed.add(from);
		pairs.push({ from, to });
	}

	return { collisions, pairs, skipped };
}

function collectCandidates(collections: DataStoreCollections): Array<RedirectPair> {
	return redirectCollections.flatMap((collection) =>
		getDataStoreCollection(collections, [collection]).flatMap((entry) =>
			toFormerIds(entry)
				.map((formerId) => ({
					from: getContentUrl(collection, formerId),
					to: getContentUrl(collection, entry.id),
				}))
				.filter(({ from, to }) => from !== to),
		),
	);
}

function collectLivePaths(collections: DataStoreCollections): Set<string> {
	return new Set(
		redirectCollections.flatMap((collection) =>
			getDataStoreCollection(collections, [collection]).map((entry) =>
				getContentUrl(collection, entry.id),
			),
		),
	);
}
