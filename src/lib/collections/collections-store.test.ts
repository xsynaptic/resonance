import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { TermCollectionKey } from '#lib/catalog/catalog-types.ts';
import type { StubEntry } from '#lib/collections/astro-content-stub.ts';

const termCollectionKeys = [
	'artists',
	'eras',
	'labels',
	'regions',
	'series',
	'styles',
	'themes',
] as const satisfies Array<TermCollectionKey>;

function makeStore(): Record<string, Array<Pick<StubEntry, 'data' | 'id'>>> {
	return {
		artists: [{ data: { title: 'Ott' }, id: 'ott' }],
		eras: [{ data: { title: '1990s' }, id: '1990s' }],
		labels: [{ data: { title: 'Twisted Records' }, id: 'twisted-records' }],
		regions: [{ data: { title: 'Europe' }, id: 'europe' }],
		reviews: [
			{
				data: {
					dateCreated: new Date('2023-01-01'),
					eras: [{ id: '1990s' }],
					labels: [{ id: 'twisted-records' }],
					regions: [{ id: 'europe' }],
					styles: [{ id: 'darkpsy' }],
					title: 'Review One',
				},
				id: 'review-one',
			},
		],
		series: [{ data: { title: 'Sessions' }, id: 'sessions' }],
		styles: [
			{ data: { title: 'Psytrance' }, id: 'psytrance' },
			{ data: { parent: { id: 'psytrance' }, title: 'Darkpsy' }, id: 'darkpsy' },
		],
		themes: [{ data: { title: 'Night' }, id: 'night' }],
	};
}

let store: ReturnType<typeof makeStore>;

beforeEach(async () => {
	vi.resetModules();

	store = makeStore();

	const { setCollections } = await import('#lib/collections/astro-content-stub.ts');

	setCollections(store);
});

async function loadTermCollections() {
	const { getTermCollection } = await import('#lib/collections/terms/term-data.ts');

	return Promise.all(termCollectionKeys.map((collection) => getTermCollection(collection)));
}

describe('term collection wrappers', () => {
	test('never write the content store', async () => {
		const snapshot = structuredClone(store);

		await loadTermCollections();

		expect(store).toEqual(snapshot);
	});

	test('count content on the computed copies, rolling children up into parents', async () => {
		const { getTermCollection } = await import('#lib/collections/terms/term-data.ts');
		const { entries } = await getTermCollection('styles');

		expect(entries.map(({ data, id }) => [id, data._entryCount])).toEqual([
			['psytrance', 1],
			['darkpsy', 1],
		]);
	});
});
