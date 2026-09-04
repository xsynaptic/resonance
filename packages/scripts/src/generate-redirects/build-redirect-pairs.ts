import { getContentUrl, getOpenGraphPath } from '@xsynaptic/shared/routing';

import type { ContentEntry } from '../shared/astro-content.js';

import { toFormerIds } from '../shared/entries.js';

// Terms carry no formerIds: their slugs never changed, only the base path they sit under
export const redirectCollections = ['mixes', 'pages', 'posts', 'reviews'] as const;

export interface RedirectBuild {
	// A former id matching a live path; fatal, because a rule takes that page off the site
	collisions: Array<string>;
	pairs: Array<RedirectPair>;
	skipped: Array<string>;
}

interface RedirectCandidate {
	collection: string;
	formerId: string;
	id: string;
}

interface RedirectPair {
	from: string;
	to: string;
}

// Drafts never reach the content store, so an old slug starts redirecting when its draft is triaged
export function buildRedirectPairs(entries: Array<ContentEntry>): RedirectBuild {
	const livePaths = collectLivePaths(entries);
	const claimed = new Set<string>();
	const collisions: Array<string> = [];
	const pairs: Array<RedirectPair> = [];
	const skipped: Array<string> = [];

	for (const { collection, formerId, id } of collectCandidates(entries)) {
		const from = getContentUrl(collection, formerId);

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

		// A platform re-fetching only the cached card URL never sees the page redirect
		// Pushed with the page so the guards above cover both
		pairs.push(
			{ from, to: getContentUrl(collection, id) },
			{ from: getOpenGraphPath(collection, formerId), to: getOpenGraphPath(collection, id) },
		);
	}

	return { collisions, pairs, skipped };
}

// Collection order decides which rule claims a path first, so entries are walked in that order
function collectCandidates(entries: Array<ContentEntry>): Array<RedirectCandidate> {
	return redirectCollections.flatMap((collection) =>
		entriesFrom(entries, collection).flatMap((entry) =>
			toFormerIds(entry)
				.filter((formerId) => formerId !== entry.id)
				.map((formerId) => ({ collection, formerId, id: entry.id })),
		),
	);
}

function collectLivePaths(entries: Array<ContentEntry>): Set<string> {
	return new Set(
		redirectCollections.flatMap((collection) =>
			entriesFrom(entries, collection).map((entry) => getContentUrl(collection, entry.id)),
		),
	);
}

function entriesFrom(entries: Array<ContentEntry>, collection: string): Array<ContentEntry> {
	return entries.filter((entry) => entry.collection === collection);
}
