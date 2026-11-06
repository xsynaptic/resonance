import type { ContentEntry } from '@xsynaptic/astro-scripts';

import { fc, test } from '@fast-check/vitest';
import { getContentPath } from '@xsynaptic/shared/routing';
import { describe, expect } from 'vitest';

import { buildRedirectPairs } from '#generate-redirects/build-redirect-pairs.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const noneReserved = { routeSections: new Set<string>(), ruleSources: [] };

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

		expect(buildRedirectPairs(entries, noneReserved).pairs).toEqual([
			{ from: '/mixes/old-mix/', to: '/mixes/a-mix/' },
			{ from: '/og/mixes-old-mix.jpg', to: '/og/mixes-a-mix.jpg' },
			{ from: '/old-post/', to: '/a-post/' },
			{ from: '/og/posts-old-post.jpg', to: '/og/posts-a-post.jpg' },
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

		const { collisions, pairs, skipped } = buildRedirectPairs(entries, noneReserved);

		expect(pairs).toEqual([
			{ from: '/shared/', to: '/first/' },
			{ from: '/og/posts-shared.jpg', to: '/og/posts-first.jpg' },
		]);
		expect(collisions).toEqual(['/about/ is a live page']);
		expect(skipped).toEqual(['/shared/ is claimed by an earlier rule']);
	});

	const sections = ['mixes', 'archive', 'reviews'];
	const ruleSources = ['/feed/'];
	const slugs = fc.constantFrom('a', 'b', 'feed', '2', ...sections);
	const entry = fc.record({
		collection: fc.constantFrom('mixes', 'pages', 'posts', 'reviews'),
		formerIds: fc.uniqueArray(slugs, { maxLength: 2 }),
		id: slugs,
	});
	const entries = fc.uniqueArray(entry, {
		maxLength: 5,
		minLength: 1,
		selector: (value) => getContentPath(value.collection, value.id),
	});

	test.prop([entries])(
		'never redirects away from a path the site builds or a rule already owns',
		(generated) => {
			const contentEntries = generated.map(({ collection, formerIds, id }) =>
				makeEntry({ collection, data: { formerIds }, id }),
			);
			const livePaths = new Set(
				generated.map(({ collection, id }) => getContentPath(collection, id)),
			);
			const isBuiltPath = (path: string) =>
				livePaths.has(path) ||
				sections.some((section) => path === `/${section}/`) ||
				/^\/(?:mixes|reviews)\/\d+\/$/.test(path);
			const { pairs } = buildRedirectPairs(contentEntries, {
				routeSections: new Set(sections),
				ruleSources,
			});
			const pageRules = pairs.filter((pair) => !pair.from.startsWith('/og/'));

			for (const { from, to } of pageRules) {
				expect(isBuiltPath(from)).toBe(false);
				expect(ruleSources).not.toContain(from);
				expect(livePaths.has(to)).toBe(true);
			}
			expect(new Set(pageRules.map((pair) => pair.from)).size).toBe(pageRules.length);
		},
	);
});
