import { afterEach, describe, expect, test, vi } from 'vitest';

import { setCollections } from '#lib/test/astro-content.ts';
import { labelIds, resolveAncestors, resolveRefs } from '#lib/utils/terms.ts';

setCollections({
	artists: [
		{ data: { title: 'DJ Basilisk' }, id: 'dj-basilisk' },
		{ data: { title: 'Ott' }, id: 'ott' },
	],
	labels: [
		{ data: { title: 'Twisted Records' }, id: 'twisted-records' },
		{ data: { parent: { id: 'twisted-records' }, title: 'Twisted Sub' }, id: 'twisted-sub' },
	],
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('resolveRefs', () => {
	test('links an object ref through its id', async () => {
		await expect(resolveRefs('artists', [{ id: 'dj-basilisk' }])).resolves.toEqual([
			{ label: 'DJ Basilisk', url: '/artists/dj-basilisk/' },
		]);
	});

	test('lets an object ref override the catalog title', async () => {
		await expect(
			resolveRefs('artists', [{ id: 'dj-basilisk', name: 'Basilisk (live)' }]),
		).resolves.toEqual([{ label: 'Basilisk (live)', url: '/artists/dj-basilisk/' }]);
	});

	test('warns and renders plain when an object ref names nothing', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

		await expect(resolveRefs('artists', [{ id: 'no-such-artist' }])).resolves.toEqual([
			{ label: 'no-such-artist' },
		]);
		expect(warned).toHaveBeenCalledOnce();
	});

	test('links free text opportunistically, keeping the written spelling', async () => {
		await expect(resolveRefs('artists', ['dj basilisk'])).resolves.toEqual([
			{ label: 'dj basilisk', url: '/artists/dj-basilisk/' },
		]);
	});

	test('leaves free text that names no term unlinked, and does not warn', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

		await expect(resolveRefs('artists', ['Some Guest'])).resolves.toEqual([
			{ label: 'Some Guest' },
		]);
		expect(warned).not.toHaveBeenCalled();
	});
});

describe('resolveAncestors', () => {
	test('trails a hierarchical term root first', async () => {
		await expect(resolveAncestors('labels', 'twisted-sub')).resolves.toEqual([
			{ label: 'Twisted Records', url: '/labels/twisted-records/' },
		]);
	});

	test('returns nothing for a term with no parent', async () => {
		await expect(resolveAncestors('labels', 'twisted-records')).resolves.toEqual([]);
	});
});

describe('labelIds', () => {
	test('keeps the linked refs and drops the free text', () => {
		expect(
			labelIds(['Some Label', { id: 'twisted-records' }, { code: 'TW', id: 'other' }]),
		).toEqual(['twisted-records', 'other']);
	});
});
