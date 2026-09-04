import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { pullSoundcloudStats, soundcloudStatsPath } from './soundcloud-stats.js';

const tokenUrl = 'https://secure.soundcloud.com/oauth/token';
const resolveUrl = 'https://api.soundcloud.com/resolve';
const firstPageUrl = 'https://api.soundcloud.com/users/soundcloud:users:1/tracks';
const secondPageUrl = 'https://api.soundcloud.com/users/soundcloud:users:1/tracks?cursor=2';

function track(permalink: string, plays: number) {
	return {
		comment_count: 0,
		favoritings_count: 0,
		permalink_url: `https://soundcloud.com/djbasilisk/${permalink}?utm_source=id_1`,
		playback_count: plays,
		reposts_count: 0,
		urn: `soundcloud:tracks:${permalink}`,
	};
}

// SoundCloud answers `/resolve` with a 302 whose body carries the canonical URL, not a redirect body
const resolveResponse = () =>
	Response.json(
		{ location: 'https://api.soundcloud.com/users/soundcloud:users:1' },
		{
			status: 302,
		},
	);

let rootPath: string;
let requests: Array<string>;

async function readLines(): Promise<Array<string>> {
	try {
		const contents = await readFile(path.join(rootPath, soundcloudStatsPath), 'utf8');

		return contents.split('\n').filter((line) => line !== '');
	} catch {
		return [];
	}
}

function stubFetch(handler: (url: string) => Response) {
	requests = [];
	vi.stubGlobal(
		'fetch',
		vi.fn((input: unknown) => {
			const url = String(input);

			requests.push(url);

			return Promise.resolve(handler(url));
		}),
	);
}

beforeEach(async () => {
	rootPath = await mkdtemp(path.join(os.tmpdir(), 'soundcloud-stats-'));
	await mkdir(path.join(rootPath, 'packages/content'), { recursive: true });
	vi.stubEnv('SOUNDCLOUD_CLIENT_ID', 'test-id');
	vi.stubEnv('SOUNDCLOUD_CLIENT_SECRET', 'test-secret');
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('pullSoundcloudStats', () => {
	test('exchanges the token exactly once, then pages to exhaustion', async () => {
		stubFetch((url) => {
			if (url.startsWith(tokenUrl)) return Response.json({ access_token: 'test-token' });
			if (url.startsWith(resolveUrl)) return resolveResponse();
			if (url.startsWith(secondPageUrl)) return Response.json({ collection: [track('b', 2)] });

			return Response.json({ collection: [track('a', 1)], next_href: secondPageUrl });
		});

		await pullSoundcloudStats({ rootPath });

		expect(requests.filter((url) => url.startsWith(tokenUrl))).toHaveLength(1);
		expect(requests.filter((url) => url.startsWith(firstPageUrl))).toHaveLength(2);

		const [line] = await readLines();
		const generation = JSON.parse(String(line)) as { items: Record<string, unknown> };

		expect(generation.items).toEqual({
			'/djbasilisk/a': { comments: 0, id: 'soundcloud:tracks:a', likes: 0, plays: 1, reposts: 0 },
			'/djbasilisk/b': { comments: 0, id: 'soundcloud:tracks:b', likes: 0, plays: 2, reposts: 0 },
		});
	});

	// A gap in generations is recoverable; a generation of zeroes poisons every delta spanning it
	test('appends nothing when a page mid-pagination fails', async () => {
		stubFetch((url) => {
			if (url.startsWith(tokenUrl)) return Response.json({ access_token: 'test-token' });
			if (url.startsWith(resolveUrl)) return resolveResponse();
			if (url.startsWith(secondPageUrl)) return new Response('rate limited', { status: 429 });

			return Response.json({ collection: [track('a', 1)], next_href: secondPageUrl });
		});

		await pullSoundcloudStats({ rootPath });

		expect(await readLines()).toEqual([]);
	});

	test('skips a generation under 24 hours old, and runs it with force', async () => {
		const filePath = path.join(rootPath, soundcloudStatsPath);
		const seed = JSON.stringify({
			generated_at: new Date(Date.now() - 3_600_000).toISOString().slice(0, 19) + 'Z',
			items: { '/djbasilisk/a': { plays: 1 } },
			version: 1,
		});

		await writeFile(filePath, `${seed}\n`, 'utf8');

		stubFetch((url) => {
			if (url.startsWith(tokenUrl)) return Response.json({ access_token: 'test-token' });
			if (url.startsWith(resolveUrl)) return resolveResponse();

			return Response.json({ collection: [track('a', 9)] });
		});

		await pullSoundcloudStats({ rootPath });

		expect(requests).toEqual([]);
		expect(await readLines()).toHaveLength(1);

		await pullSoundcloudStats({ force: true, rootPath });

		expect(await readLines()).toHaveLength(2);
	});
});
