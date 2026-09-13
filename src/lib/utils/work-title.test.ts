import type { CollectionEntry } from 'astro:content';

import { describe, expect, test } from 'vitest';

import { setCollections } from '#lib/collections/astro-content-stub.ts';
import { getWorkTitle } from '#lib/utils/work-title.ts';

setCollections({
	artists: [
		{ data: { title: 'DJ Basilisk' }, id: 'dj-basilisk' },
		{ data: { title: 'Guy Sebbag' }, id: 'guy-sebbag' },
		{ data: { title: 'Ott' }, id: 'ott' },
	],
});

// getWorkTitle reads a handful of fields; filling the rest of a CollectionEntry would say nothing
function makeMix(data: Record<string, unknown>): CollectionEntry<'mixes'> {
	return { collection: 'mixes', data, id: 'a-mix' } as unknown as CollectionEntry<'mixes'>;
}

function makeReview(data: Record<string, unknown>): CollectionEntry<'reviews'> {
	return { collection: 'reviews', data, id: 'a-review' } as unknown as CollectionEntry<'reviews'>;
}

describe('getWorkTitle', () => {
	test('credits a mix to its alias', async () => {
		const mix = makeMix({ alias: { collection: 'artists', id: 'dj-basilisk' }, title: 'Voyager' });

		await expect(getWorkTitle(mix)).resolves.toEqual({
			credit: { name: 'DJ Basilisk', url: '/artists/dj-basilisk/' },
			title: 'Voyager',
		});
	});

	test('leaves a mix with no alias uncredited', async () => {
		await expect(getWorkTitle(makeMix({ title: 'Voyager' }))).resolves.toEqual({
			title: 'Voyager',
		});
	});

	test('splits a review title and links the prefix naming its credit', async () => {
		const review = makeReview({
			artists: [{ id: 'ott' }],
			releaseTitle: 'Skylon',
			title: 'Ott - Skylon',
		});

		await expect(getWorkTitle(review)).resolves.toEqual({
			credit: { name: 'Ott', url: '/artists/ott/' },
			title: 'Skylon',
		});
	});

	test('splits off a free-text credit that names no term, unlinked', async () => {
		const review = makeReview({
			artists: ['Some Guest'],
			releaseTitle: 'Elsewhere',
			title: 'Some Guest - Elsewhere',
		});

		await expect(getWorkTitle(review)).resolves.toEqual({
			credit: { name: 'Some Guest' },
			title: 'Elsewhere',
		});
	});

	test('keeps a compilation whose title is its release title as a bare cited title', async () => {
		const review = makeReview({
			artists: [{ id: 'ott' }],
			releaseTitle: 'Tribal Science',
			title: 'Tribal Science',
		});

		await expect(getWorkTitle(review)).resolves.toEqual({ title: 'Tribal Science' });
	});

	test('splits a prefix naming two separate credits as one plain credit', async () => {
		const review = makeReview({
			artists: [{ id: 'guy-sebbag' }, 'Gal Carmy'],
			releaseTitle: 'In Trance',
			title: 'Guy Sebbag & Gal Carmy - In Trance',
		});

		await expect(getWorkTitle(review)).resolves.toEqual({
			credit: { name: 'Guy Sebbag & Gal Carmy' },
			title: 'In Trance',
		});
	});
});
