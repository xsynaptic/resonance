import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { WaveformArchive } from '#waveform/panel/waveform-archive.ts';

import { chunkOf, offline, stubArchiveFetch } from '#test/archive-fetch.ts';
import { openArchive } from '#waveform/panel/waveform-archive.ts';

function open(name: string): WaveformArchive {
	return openArchive({
		pairCount: 20_000,
		pairsPerSecond: 100,
		url: `https://files.test/waveform/${name}.dat`,
	});
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['clearTimeout', 'setTimeout'] });
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test('opens without a request, and a chunk in flight is not asked for again', () => {
	const { chunkRequests } = stubArchiveFetch(offline);
	const archive = open('unasked');

	expect(chunkRequests()).toBe(0);

	void archive.want(0, 100);
	void archive.want(9000, 9100);
	void archive.want(0, 100);

	expect(archive.missing(0, 9100).map(({ chunk }) => chunk)).toStrictEqual([0, 1]);
	expect(chunkRequests()).toBe(2);
});

test('a span with a gap settles only once a chunk has its samples in place', async () => {
	stubArchiveFetch(() => chunkOf(7));

	const archive = open('landing-track');
	const landing = archive.want(0, 100);

	expect(archive.want(0, 100)).toBe(landing);
	expect(archive.missing(0, 100)).toHaveLength(1);

	await landing;
	expect(archive.samples[0]).toBe(7);
	expect(archive.missing(0, 100)).toHaveLength(0);
	expect(archive.want(0, 100)).toBeUndefined();
});

test('a chunk that fails is asked for again as its span settles, after a wait that doubles', async () => {
	const { chunkRequests } = stubArchiveFetch(offline);
	const archive = open('offline-track');
	const askAgain = (): void => {
		void archive.want(0, 100)?.then(askAgain);
	};

	askAgain();

	await vi.advanceTimersByTimeAsync(1999);
	void archive.want(0, 100);
	expect(chunkRequests()).toBe(1);

	await vi.advanceTimersByTimeAsync(1);
	expect(chunkRequests()).toBe(2);

	await vi.advanceTimersByTimeAsync(3999);
	expect(chunkRequests()).toBe(2);

	await vi.advanceTimersByTimeAsync(1);
	expect(chunkRequests()).toBe(3);
});

function openWithBands(name: string): WaveformArchive {
	return openArchive({
		bands: {
			frameCount: 5000,
			framesPerSecond: 25,
			url: `https://files.test/waveform/${name}.bands`,
		},
		pairCount: 20_000,
		pairsPerSecond: 100,
		url: `https://files.test/waveform/${name}.dat`,
	});
}

function levelsOf(level: number): Promise<Response> {
	return Promise.resolve(new Response(new Uint8Array(2048 * 3).fill(level), { status: 206 }));
}

test('a chunk lands with its band levels already in place', async () => {
	const { chunkRequests } = stubArchiveFetch((url) =>
		url.endsWith('.bands') ? levelsOf(200) : chunkOf(7),
	);
	const archive = openWithBands('tinted-track');

	expect(archive.bands?.levels[0]).toBe(0);

	await archive.want(0, 100);

	expect(chunkRequests()).toBe(2);
	expect(archive.samples[0]).toBe(7);
	expect(archive.bands?.levels[0]).toBe(200);
	expect(archive.want(0, 100)).toBeUndefined();
});

test('peaks whose band levels failed draw plain, and only the levels are asked for again', async () => {
	let isBandsOffline = true;
	const { chunkRequests } = stubArchiveFetch((url) => {
		if (!url.endsWith('.bands')) return chunkOf(7);

		return isBandsOffline ? offline() : levelsOf(200);
	});
	const archive = openWithBands('half-landed-track');

	await archive.want(0, 100);

	expect(archive.samples[0]).toBe(7);
	expect(archive.missing(0, 100)).toHaveLength(0);
	expect(archive.bands?.levels[0]).toBe(0);
	expect(chunkRequests()).toBe(2);

	isBandsOffline = false;
	await vi.advanceTimersByTimeAsync(2000);
	await archive.want(0, 100);

	expect(chunkRequests()).toBe(3);
	expect(archive.bands?.levels[0]).toBe(200);
	expect(archive.want(0, 100)).toBeUndefined();
});
