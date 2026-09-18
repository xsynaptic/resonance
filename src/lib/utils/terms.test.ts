import { afterEach, describe, expect, test, vi } from 'vitest';

import { setCollections } from '#lib/collections/astro-content-stub.ts';
import { resolveAncestors, resolveCredits } from '#lib/utils/terms.ts';

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

describe('resolveCredits', () => {
	test('links an object credit through its id', async () => {
		await expect(resolveCredits('artists', [{ id: 'dj-basilisk' }])).resolves.toEqual([
			{ name: 'DJ Basilisk', url: '/artists/dj-basilisk/' },
		]);
	});

	test('warns and renders plain when an object credit names nothing', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

		await expect(resolveCredits('artists', [{ id: 'no-such-artist' }])).resolves.toEqual([
			{ name: 'no-such-artist' },
		]);
		expect(warned).toHaveBeenCalledOnce();
	});

	test('links free text opportunistically, keeping the written spelling', async () => {
		await expect(resolveCredits('artists', ['dj basilisk'])).resolves.toEqual([
			{ name: 'dj basilisk', url: '/artists/dj-basilisk/' },
		]);
	});

	test('leaves free text that names no term unlinked, and does not warn', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

		await expect(resolveCredits('artists', ['Some Guest'])).resolves.toEqual([
			{ name: 'Some Guest' },
		]);
		expect(warned).not.toHaveBeenCalled();
	});
});

describe('resolveAncestors', () => {
	test('trails a hierarchical term root first', async () => {
		await expect(resolveAncestors('labels', 'twisted-sub')).resolves.toEqual([
			{ name: 'Twisted Records', url: '/labels/twisted-records/' },
		]);
	});
});
