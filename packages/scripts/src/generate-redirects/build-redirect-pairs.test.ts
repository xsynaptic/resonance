import { describe, expect, test } from 'vitest';

import type { ContentEntry } from '../shared/astro-content.js';

import { makeEntry } from '../validate-content/validate-test-utils.js';
import { buildRedirectPairs } from './build-redirect-pairs.js';

// Collection order is the generator's, not the fixture's, so the entries go in flat
function makeEntries(populated: Record<string, Array<ContentEntry>>): Array<ContentEntry> {
	return Object.entries(populated).flatMap(([collection, entries]) =>
		entries.map((entry) => ({ ...entry, collection })),
	);
}

describe('buildRedirectPairs', () => {
	test('emits a flat rule for a post, a prefixed one for a mix, and a card rule for each', () => {
		const entries = makeEntries({
			mixes: [makeEntry({ data: { formerIds: ['old-mix'] }, id: 'a-mix' })],
			posts: [makeEntry({ data: { formerIds: ['old-post'] }, id: 'a-post' })],
		});

		expect(buildRedirectPairs(entries).pairs).toEqual([
			{ from: '/mixes/old-mix/', to: '/mixes/a-mix/' },
			{ from: '/og/mixes-old-mix.jpg', to: '/og/mixes-a-mix.jpg' },
			{ from: '/old-post/', to: '/a-post/' },
			{ from: '/og/posts-old-post.jpg', to: '/og/posts-a-post.jpg' },
		]);
	});

	test('emits one rule per formerId and ignores an entry carrying none', () => {
		const entries = makeEntries({
			posts: [
				makeEntry({ data: { formerIds: ['old-a', 'old-b'] }, id: 'current' }),
				makeEntry({ data: {}, id: 'plain' }),
			],
		});

		expect(buildRedirectPairs(entries).pairs).toEqual([
			{ from: '/old-a/', to: '/current/' },
			{ from: '/og/posts-old-a.jpg', to: '/og/posts-current.jpg' },
			{ from: '/old-b/', to: '/current/' },
			{ from: '/og/posts-old-b.jpg', to: '/og/posts-current.jpg' },
		]);
	});

	test('reports a collision and a skip, and drops each card rule with the page rule it rides on', () => {
		const entries = makeEntries({
			pages: [makeEntry({ data: {}, id: 'about' })],
			posts: [
				makeEntry({ data: { formerIds: ['about', 'self'] }, id: 'self' }),
				makeEntry({ data: { formerIds: ['shared'] }, id: 'first' }),
				makeEntry({ data: { formerIds: ['shared'] }, id: 'second' }),
			],
		});

		const { collisions, pairs, skipped } = buildRedirectPairs(entries);

		expect(pairs).toEqual([
			{ from: '/shared/', to: '/first/' },
			{ from: '/og/posts-shared.jpg', to: '/og/posts-first.jpg' },
		]);
		expect(collisions).toEqual(['/about/ is a live page']);
		expect(skipped).toEqual(['/shared/ is claimed by an earlier rule']);
	});
});
