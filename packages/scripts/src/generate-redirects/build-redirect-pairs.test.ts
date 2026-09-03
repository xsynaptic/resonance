import { describe, expect, test } from 'vitest';

import type { DataStoreCollections, DataStoreEntry } from '../shared/data-store.js';

import { makeEntry } from '../validate-content/validate-test-utils.js';
import { buildRedirectPairs } from './build-redirect-pairs.js';

// getDataStoreCollection throws on a collection it cannot find, so every fixture carries all four
function makeCollections(populated: Record<string, Array<DataStoreEntry>>): DataStoreCollections {
	const collections: DataStoreCollections = new Map();

	for (const name of ['mixes', 'pages', 'posts', 'reviews']) {
		const entries = populated[name] ?? [];

		collections.set(name, new Map(entries.map((entry) => [entry.id, entry])));
	}

	return collections;
}

describe('buildRedirectPairs', () => {
	test('emits a flat rule for a post and a prefixed one for a mix', () => {
		const collections = makeCollections({
			mixes: [makeEntry({ data: { formerIds: ['old-mix'] }, id: 'a-mix' })],
			posts: [makeEntry({ data: { formerIds: ['old-post'] }, id: 'a-post' })],
		});

		expect(buildRedirectPairs(collections).pairs).toEqual([
			{ from: '/mixes/old-mix/', to: '/mixes/a-mix/' },
			{ from: '/old-post/', to: '/a-post/' },
		]);
	});

	test('emits one rule per formerId and ignores an entry carrying none', () => {
		const collections = makeCollections({
			posts: [
				makeEntry({ data: { formerIds: ['old-a', 'old-b'] }, id: 'current' }),
				makeEntry({ data: {}, id: 'plain' }),
			],
		});

		expect(buildRedirectPairs(collections).pairs).toEqual([
			{ from: '/old-a/', to: '/current/' },
			{ from: '/old-b/', to: '/current/' },
		]);
	});

	test('reports a former id shadowing a live page as a collision, and a repeated one as a skip', () => {
		const collections = makeCollections({
			pages: [makeEntry({ data: {}, id: 'about' })],
			posts: [
				makeEntry({ data: { formerIds: ['about', 'self'] }, id: 'self' }),
				makeEntry({ data: { formerIds: ['shared'] }, id: 'first' }),
				makeEntry({ data: { formerIds: ['shared'] }, id: 'second' }),
			],
		});

		const { collisions, pairs, skipped } = buildRedirectPairs(collections);

		expect(pairs).toEqual([{ from: '/shared/', to: '/first/' }]);
		expect(collisions).toEqual(['/about/ is a live page']);
		expect(skipped).toEqual(['/shared/ is claimed by an earlier rule']);
	});
});
