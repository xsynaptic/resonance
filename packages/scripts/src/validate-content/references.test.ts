import { describe, expect, test } from 'vitest';

import { collectReferenceIssues } from '#validate-content/references.ts';
import { makeEntry, makeReferences } from '#validate-content/validate-test-utils.ts';

// The checked set is whichever collections the passed entries belong to
function makeEntries(mixes: Array<ReturnType<typeof makeEntry>>) {
	return [
		makeEntry({ collection: 'eras', id: 'early-2000s' }),
		makeEntry({ collection: 'styles', id: 'goa-trance' }),
		...mixes,
	];
}

describe('collectReferenceIssues', () => {
	test('flags a reference to a missing entry and reports its field path', () => {
		const entries = makeEntries([
			makeEntry({
				data: { styles: makeReferences('styles', ['goa-trance', 'vaporwave']) },
				filePath: 'collections/mixes/2011/a-mix.mdx',
				id: 'a-mix',
			}),
		]);

		expect(collectReferenceIssues(entries)).toEqual([
			{
				collection: 'styles',
				field: 'styles[1]',
				id: 'vaporwave',
				location: 'collections/mixes/2011/a-mix.mdx',
			},
		]);
	});

	test('flags a reference whose target exists in a different collection', () => {
		const entries = makeEntries([
			makeEntry({ data: { styles: makeReferences('styles', ['early-2000s']) }, id: 'a-mix' }),
		]);

		expect(collectReferenceIssues(entries)).toEqual([
			{ collection: 'styles', field: 'styles[0]', id: 'early-2000s', location: 'a-mix' },
		]);
	});

	test('flags a reference into a collection outside the checked set', () => {
		const entries = makeEntries([
			makeEntry({ data: { downloads: makeReferences('downloads', ['missing']) }, id: 'a-mix' }),
		]);

		expect(collectReferenceIssues(entries)).toEqual([
			{ collection: 'downloads', field: 'downloads[0]', id: 'missing', location: 'a-mix' },
		]);
	});

	test('ignores references into a skipped collection', () => {
		const entries = makeEntries([
			makeEntry({ data: { downloads: makeReferences('downloads', ['missing']) }, id: 'a-mix' }),
		]);

		expect(collectReferenceIssues(entries, { skipCollections: ['downloads'] })).toEqual([]);
	});

	test('ignores a polymorphic ref, which carries an id but no collection', () => {
		const entries = makeEntries([
			makeEntry({ data: { labels: [{ code: 'EKTMX3003', id: 'not-a-collection' }] }, id: 'a-mix' }),
		]);

		expect(collectReferenceIssues(entries)).toEqual([]);
	});
});
