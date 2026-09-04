import { afterEach, describe, expect, test, vi } from 'vitest';

import type { SelectionValue } from '#lib/schemas/selections.ts';

import { resolveSelections } from '#lib/collections/selections/selections-resolve.ts';
import { setCollections } from '#lib/test/astro-content.ts';

vi.mock('#lib/utils/markdown.ts', () => ({
	renderMarkdown: (text: string) => Promise.resolve(`<p>${text}</p>`),
}));

setCollections({
	artists: [{ data: { title: 'Ott' }, id: 'ott' }],
	labels: [{ data: { title: 'Twisted Records' }, id: 'twisted-records' }],
	mixes: [{ data: { imageFeatured: 'voyager-cover', title: 'Voyager' }, id: 'voyager' }],
	reviews: [
		{
			data: {
				artists: [{ id: 'ott' }],
				discogsUrl: 'https://www.discogs.com/release/1',
				imageFeatured: 'skylon-cover',
				labels: [{ id: 'twisted-records' }],
				links: ['https://example.test/skylon'],
				releaseTitle: 'Skylon',
				releaseYear: '2008',
				title: 'Ott - Skylon',
				youtubeSearch: true,
			},
			id: 'ott-skylon',
		},
		{
			data: {
				artists: [{ id: 'ott' }],
				releaseTitle: 'Skylon',
				title: 'A Retrospective',
			},
			id: 'ott-retrospective',
		},
	],
});

async function resolveOne(selection: SelectionValue) {
	const [resolved] = await resolveSelections([selection]);

	return resolved;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('resolveSelections', () => {
	test('fills every unset field from the entry the row names', async () => {
		expect(await resolveOne({ entryId: 'ott-skylon' })).toEqual({
			anchor: 'ott-skylon',
			artists: [{ label: 'Ott', url: '/artists/ott/' }],
			Content: 'body:ott-skylon',
			discogsUrl: 'https://www.discogs.com/release/1',
			href: '/reviews/ott-skylon/',
			imagePath: 'skylon-cover',
			labels: [{ label: 'Twisted Records', url: '/labels/twisted-records/' }],
			links: ['https://example.test/skylon'],
			linkYoutube: 'https://www.youtube.com/results?search_query=Ott%20Skylon',
			title: 'Skylon',
			year: '2008',
		});
	});

	test('leaves a review title unsplit when it does not carry the credit as a prefix', async () => {
		const resolved = await resolveOne({ entryId: 'ott-retrospective' });

		expect(resolved?.title).toBe('A Retrospective');
		expect(resolved?.artists).toEqual([]);
	});

	test('an inline field wins over the entry it names', async () => {
		const resolved = await resolveOne({
			entryId: 'ott-skylon',
			title: 'Skylon (remastered)',
			year: '2019',
		});

		expect(resolved?.title).toBe('Skylon (remastered)');
		expect(resolved?.year).toBe('2019');
		expect(resolved?.discogsUrl).toBe('https://www.discogs.com/release/1');
	});

	test('inline artists replace the derived credit and resolve as polymorphic refs', async () => {
		const resolved = await resolveOne({
			artists: ['ott', 'Some Guest'],
			entryId: 'ott-skylon',
		});

		expect(resolved?.artists).toEqual([
			{ label: 'ott', url: '/artists/ott/' },
			{ label: 'Some Guest' },
		]);
	});

	test('an inline description replaces the entry body', async () => {
		const resolved = await resolveOne({ description: 'A note.', entryId: 'ott-skylon' });

		expect(resolved?.descriptionHtml).toBe('<p>A note.</p>');
		expect(resolved?.Content).toBeUndefined();
	});

	test('takes only title, link and image from a collection that is not a review', async () => {
		expect(await resolveOne({ entryId: 'voyager' })).toMatchObject({
			artists: [],
			href: '/mixes/voyager/',
			imagePath: 'voyager-cover',
			labels: [],
			links: [],
			title: 'Voyager',
			year: undefined,
		});
	});

	test('leaves a row on its own fields when the entry id resolves to nothing', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
		const resolved = await resolveOne({ entryId: 'no-such-entry', title: 'Elsewhere' });

		expect(resolved?.title).toBe('Elsewhere');
		expect(resolved?.href).toBeUndefined();
		expect(warned).toHaveBeenCalledOnce();
	});

	test('anchors a row with no entry on its credit and title', async () => {
		const resolved = await resolveOne({ artists: 'Ott', title: 'Skylon' });

		expect(resolved?.anchor).toBe('ott-skylon');
	});

	test('offers a YouTube search only where the row asks for one', async () => {
		const asked = await resolveOne({ artists: 'Ott', title: 'Skylon', youtubeSearch: true });
		const unasked = await resolveOne({ artists: 'Ott', title: 'Skylon' });

		expect(asked?.linkYoutube).toBe('https://www.youtube.com/results?search_query=Ott%20Skylon');
		expect(unasked?.linkYoutube).toBeUndefined();
	});
});
