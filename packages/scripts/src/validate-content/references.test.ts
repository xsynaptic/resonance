import { describe, expect, test } from 'vitest';

import { collectReferenceIssues } from './references.js';
import { makeCollections, makeEntry, makeRefs } from './validate-test-utils.js';

const collectionNames = ['mixes', 'eras', 'styles'];

function makeStore(mixes: Array<ReturnType<typeof makeEntry>>) {
	return makeCollections({
		eras: [makeEntry({ id: 'early-2000s' })],
		mixes,
		styles: [makeEntry({ id: 'goa-trance' })],
	});
}

describe('collectReferenceIssues', () => {
	test('accepts references that resolve', () => {
		const collections = makeStore([
			makeEntry({
				data: {
					eras: makeRefs('eras', ['early-2000s']),
					styles: makeRefs('styles', ['goa-trance']),
				},
				id: 'a-mix',
			}),
		]);

		expect(collectReferenceIssues(collections, collectionNames)).toEqual([]);
	});

	test('flags a reference to a missing entry and reports its field path', () => {
		const collections = makeStore([
			makeEntry({
				data: { styles: makeRefs('styles', ['goa-trance', 'vaporwave']) },
				filePath: 'collections/mixes/2011/a-mix.mdx',
				id: 'a-mix',
			}),
		]);

		expect(collectReferenceIssues(collections, collectionNames)).toEqual([
			{
				collection: 'styles',
				field: 'styles[1]',
				id: 'vaporwave',
				location: 'collections/mixes/2011/a-mix.mdx',
			},
		]);
	});

	test('flags a reference whose target exists in a different collection', () => {
		const collections = makeStore([
			makeEntry({ data: { styles: makeRefs('styles', ['early-2000s']) }, id: 'a-mix' }),
		]);

		expect(collectReferenceIssues(collections, collectionNames)).toEqual([
			{ collection: 'styles', field: 'styles[0]', id: 'early-2000s', location: 'a-mix' },
		]);
	});

	test('ignores references into collections outside the checked set', () => {
		const collections = makeStore([
			makeEntry({ data: { downloads: makeRefs('downloads', ['missing']) }, id: 'a-mix' }),
		]);

		expect(collectReferenceIssues(collections, collectionNames)).toEqual([]);
	});

	test('ignores a polymorphic ref, which carries an id but no collection', () => {
		const collections = makeStore([
			makeEntry({ data: { labels: [{ code: 'EKTMX3003', id: 'not-a-collection' }] }, id: 'a-mix' }),
		]);

		expect(collectReferenceIssues(collections, collectionNames)).toEqual([]);
	});
});
