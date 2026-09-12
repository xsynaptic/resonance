import { describe, expect, test, vi } from 'vitest';

import type { TermCollectionKey } from '#lib/catalog/catalog-types.ts';
import type { StubEntry } from '#lib/collections/astro-content-stub.ts';

type Fixtures = Record<string, Array<Pick<StubEntry, 'data' | 'id'>>>;

const fixtures: Fixtures = {
	artists: [{ data: { title: 'Ott' }, id: 'ott' }],
	eras: [
		{ data: { title: '1990s' }, id: '1990s' },
		{ data: { parent: { id: '1990s' }, title: 'Late 1990s' }, id: 'late-1990s' },
		{ data: { parent: { id: '1990s' }, title: 'Mid 1990s' }, id: 'mid-1990s' },
		{ data: { title: '2000s' }, id: '2000s' },
	],
	labels: [
		{ data: { title: 'Ektoplazm' }, id: 'ektoplazm' },
		{ data: { parent: { id: 'ektoplazm' }, title: 'Ektoplazm Digital' }, id: 'ektoplazm-digital' },
		{ data: { title: 'Twisted Records' }, id: 'twisted-records' },
	],
	regions: [
		{ data: { title: 'Europe' }, id: 'europe' },
		{ data: { parent: { id: 'europe' }, title: 'The Netherlands' }, id: 'netherlands' },
		{ data: { parent: { id: 'europe' }, title: 'Sweden' }, id: 'sweden' },
	],
	reviews: [
		{
			data: {
				dateCreated: new Date('2023-01-01'),
				eras: [{ id: 'mid-1990s' }],
				labels: [{ id: 'ektoplazm-digital' }],
				regions: [{ id: 'sweden' }],
				styles: [{ id: 'darkpsy' }],
				title: 'Review One',
			},
			id: 'review-one',
		},
		{
			data: {
				dateCreated: new Date('2023-02-01'),
				styles: [{ id: 'darkpsy' }],
				title: 'Review Two',
			},
			id: 'review-two',
		},
		{
			data: {
				dateCreated: new Date('2023-03-01'),
				regions: [{ id: 'netherlands' }],
				styles: [{ id: 'forest' }],
				title: 'Review Three',
			},
			id: 'review-three',
		},
		{
			data: {
				dateCreated: new Date('2023-04-01'),
				styles: [{ id: 'techno' }],
				title: 'Review Four',
			},
			id: 'review-four',
		},
		{
			data: {
				dateCreated: new Date('2023-05-01'),
				styles: [{ id: 'acid-techno' }],
				title: 'Review Five',
			},
			id: 'review-five',
		},
		// Gives the suppressed siblings something to hold, so an empty row cannot pass for suppression
		{
			data: {
				dateCreated: new Date('2023-06-01'),
				eras: [{ id: '2000s' }],
				labels: [{ id: 'twisted-records' }],
				title: 'Review Six',
			},
			id: 'review-six',
		},
	],
	styles: [
		{ data: { title: 'Psytrance' }, id: 'psytrance' },
		{ data: { parent: { id: 'psytrance' }, title: 'Darkpsy' }, id: 'darkpsy' },
		{ data: { parent: { id: 'psytrance' }, title: 'Forest' }, id: 'forest' },
		{ data: { parent: { id: 'psytrance' }, title: 'Full-On' }, id: 'full-on' },
		{ data: { title: 'Techno' }, id: 'techno' },
		{ data: { parent: { id: 'techno' }, title: 'Acid Techno' }, id: 'acid-techno' },
		{ data: { title: 'Ambient' }, id: 'ambient' },
	],
};

// Both the hierarchy and the stamped counts memoize, so each case builds from a fresh module graph
async function getRelations(collection: TermCollectionKey, id: string) {
	vi.resetModules();

	const { setCollections } = await import('#lib/collections/astro-content-stub.ts');

	setCollections(fixtures);

	const { getTermRelations } = await import('#lib/collections/terms/term-relations.ts');

	return getTermRelations(collection, id);
}

async function labelsByHeading(collection: TermCollectionKey, id: string) {
	const groups = await getRelations(collection, id);

	return Object.fromEntries(
		groups.map((group) => [group.heading, group.terms.map((term) => term.name)]),
	);
}

describe('getTermRelations', () => {
	test('ranks children by content count and drops the ones holding nothing', async () => {
		expect(await labelsByHeading('styles', 'psytrance')).toEqual({
			'Other styles': ['Techno'],
			Substyles: ['Darkpsy', 'Forest'],
		});
	});

	test('counts a sibling by its own descendants, not by its direct entries alone', async () => {
		// Techno holds one review itself and one through acid-techno, outranking forest's single
		expect(await labelsByHeading('styles', 'darkpsy')).toEqual({
			'Other styles': ['Forest'],
		});
	});

	test('breaks a tie on title rather than the slug behind it', async () => {
		expect(await labelsByHeading('regions', 'europe')).toEqual({
			Subregions: ['Sweden', 'The Netherlands'],
		});
	});

	test('suppresses the siblings row on labels, where peers share an owner and nothing else', async () => {
		expect(await labelsByHeading('labels', 'ektoplazm')).toEqual({
			Sublabels: ['Ektoplazm Digital'],
		});
	});

	test('suppresses the siblings row on eras', async () => {
		expect(await labelsByHeading('eras', '1990s')).toEqual({
			'Sub-eras': ['Mid 1990s'],
		});
	});

	test('returns nothing for a flat vocabulary', async () => {
		expect(await getRelations('artists', 'ott')).toEqual([]);
	});

	test('returns nothing for a term with no children and no siblings', async () => {
		expect(await getRelations('labels', 'ektoplazm-digital')).toEqual([]);
	});

	test('links each term to its own detail page', async () => {
		const [group] = await getRelations('regions', 'europe');

		expect(group?.terms).toEqual([
			{ name: 'Sweden', url: '/regions/sweden/' },
			{ name: 'The Netherlands', url: '/regions/netherlands/' },
		]);
	});
});
