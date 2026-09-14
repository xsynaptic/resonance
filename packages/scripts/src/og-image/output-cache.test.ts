import { openGraphImageFormat, openGraphManifestFile } from '@xsynaptic/shared/constants';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createOutputCache, getCacheKey } from '#og-image/output-cache.ts';

describe('getCacheKey', () => {
	const base = {
		digest: 'digest',
		imageFeaturedId: 'image/entry.jpg',
		imageModifiedTime: 1000,
		style: undefined,
	};

	test('changes when the Featured Image is edited, so a retouched image regenerates its card', () => {
		expect(getCacheKey({ ...base, imageModifiedTime: 2000 })).not.toBe(getCacheKey(base));
	});

	test('changes when the entry content changes', () => {
		expect(getCacheKey({ ...base, digest: 'other' })).not.toBe(getCacheKey(base));
	});

	test('stays stable when the Featured Image has no modified time', () => {
		const key = getCacheKey({ ...base, imageModifiedTime: undefined });

		expect(key).toBe(getCacheKey({ ...base, imageModifiedTime: undefined }));
		expect(key).not.toBe(getCacheKey(base));
	});
});

describe('createOutputCache', () => {
	let directory: string;

	function writeCard(id: string) {
		writeFileSync(path.join(directory, `${id}.${openGraphImageFormat}`), 'card');
	}

	function readManifest(): Record<string, string> {
		return JSON.parse(readFileSync(path.join(directory, openGraphManifestFile), 'utf8')) as Record<
			string,
			string
		>;
	}

	beforeEach(() => {
		directory = mkdtempSync(path.join(tmpdir(), 'og-output-cache-'));
	});

	afterEach(() => {
		rmSync(directory, { force: true, recursive: true });
	});

	test('a recorded key without its file is stale, so a cleared directory redraws', async () => {
		const cache = await createOutputCache(directory);

		await cache.write('posts-a-post', 'key', new TextEncoder().encode('card'));

		expect(cache.isFresh('posts-a-post', 'key')).toBe(true);

		rmSync(cache.filePath('posts-a-post'));

		expect(cache.isFresh('posts-a-post', 'key')).toBe(false);
	});

	test('freshness survives a new run through the manifest', async () => {
		const first = await createOutputCache(directory);

		await first.write('posts-a-post', 'key', new TextEncoder().encode('card'));
		await first.save();

		const second = await createOutputCache(directory);

		expect(second.isFresh('posts-a-post', 'key')).toBe(true);
	});

	test('prune drops cards and keys the built set no longer asks for', async () => {
		const cache = await createOutputCache(directory);

		await cache.write('posts-a-post', 'key', new TextEncoder().encode('card'));
		await cache.write('posts-an-orphan', 'key', new TextEncoder().encode('card'));
		writeCard('posts-never-recorded');

		expect(await cache.prune(new Set(['posts-a-post']))).toBe(2);

		await cache.save();

		expect(Object.keys(readManifest())).toEqual(['posts-a-post']);
	});

	test('prune refuses an empty set, because a missing dist is not a deletion order', async () => {
		const cache = await createOutputCache(directory);

		await cache.write('posts-a-post', 'key', new TextEncoder().encode('card'));

		expect(await cache.prune(new Set())).toBe(0);

		await cache.save();

		expect(Object.keys(readManifest())).toEqual(['posts-a-post']);
	});
});
