import type { DataStoreCollections } from '../shared/data-store.js';

import { getDataStoreCollection, toFormerIds } from '../shared/data-store.js';

// Where each collection's detail pages live; mirrors `getContentUrl` in lib/utils/routing.ts
// Terms carry no formerIds: their slugs never changed, only the base path they sit under
const collectionPrefixes = Object.entries({
	mixes: '/mixes/',
	pages: '/',
	posts: '/',
	reviews: '/reviews/',
});

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
	return collectionPrefixes.flatMap(([collection, prefix]) =>
		getDataStoreCollection(collections, [collection]).flatMap((entry) =>
			toFormerIds(entry)
				.map((formerId) => ({ from: `${prefix}${formerId}/`, to: `${prefix}${entry.id}/` }))
				.filter(({ from, to }) => from !== to),
		),
	);
}

function collectLivePaths(collections: DataStoreCollections): Set<string> {
	return new Set(
		collectionPrefixes.flatMap(([collection, prefix]) =>
			getDataStoreCollection(collections, [collection]).map((entry) => `${prefix}${entry.id}/`),
		),
	);
}
