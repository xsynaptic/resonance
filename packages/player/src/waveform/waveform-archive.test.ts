import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { WaveformArchive } from '#waveform/waveform-archive.ts';

import { chunkOf, offline, stubArchiveFetch } from '#test/archive-fetch.ts';
import { openArchive } from '#waveform/waveform-archive.ts';

// 200 seconds in chunks of 81.92, so the third chunk is short
function open(name: string): WaveformArchive {
	return openArchive({
		byteOffset: 20,
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
	expect(archive.durationSeconds).toBe(200);

	void archive.request(0, 1);
	void archive.request(90, 91);
	void archive.request(0, 1);

	expect(archive.pending(0, 91)).toStrictEqual([
		[0, 81.92],
		[81.92, 163.84],
	]);
	expect(chunkRequests()).toBe(2);
});

test('the last chunk is pending only as far as the archive runs, and asks for no byte past it', () => {
	const { rangeRequests } = stubArchiveFetch(offline);
	const archive = open('short-tail');

	void archive.request(190, 500);

	expect(archive.pending(190, 500)).toStrictEqual([[163.84, 200]]);
	expect(rangeRequests()).toStrictEqual(['bytes=32788-40019']);
});

test('a window with a gap settles only once a chunk has its samples in place', async () => {
	stubArchiveFetch(() => chunkOf(7));

	const archive = open('landing-track');
	const landing = archive.request(0, 1);

	expect(archive.request(0, 1)).toBe(landing);
	expect(archive.pending(0, 1)).toHaveLength(1);

	await landing;
	expect(archive.peaks.samples[0]).toBe(7);
	expect(archive.pending(0, 1)).toHaveLength(0);
	expect(archive.request(0, 1)).toBeUndefined();
});

test('a chunk that fails is asked for again as its window settles, after a wait that doubles', async () => {
	const { chunkRequests } = stubArchiveFetch(offline);
	const archive = open('offline-track');
	const askAgain = (): void => {
		void archive.request(0, 1)?.then(askAgain);
	};

	askAgain();

	await vi.advanceTimersByTimeAsync(1999);
	void archive.request(0, 1);
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
			bandCount: 3,
			byteOffset: 36,
			frameCount: 5000,
			framesPerSecond: 25,
			minDecibels: -60,
			url: `https://files.test/waveform/${name}.bands`,
		},
		byteOffset: 20,
		pairCount: 20_000,
		pairsPerSecond: 100,
		url: `https://files.test/waveform/${name}.dat`,
	});
}

function levelsOf(level: number): Promise<Response> {
	return Promise.resolve(new Response(new Uint8Array(2048 * 3).fill(level), { status: 206 }));
}

test('a chunk lands with its band levels already in place, each read from past its own header', async () => {
	const { rangeRequests } = stubArchiveFetch((url) =>
		url.endsWith('.bands') ? levelsOf(200) : chunkOf(7),
	);
	const archive = openWithBands('tinted-track');

	expect(archive.bands).toMatchObject({ bandCount: 3, framesPerSecond: 25, minDecibels: -60 });
	expect(archive.bands?.levels[0]).toBe(0);

	await archive.request(0, 1);

	expect(rangeRequests()).toStrictEqual(['bytes=36-6179', 'bytes=20-16403']);
	expect(archive.peaks.samples[0]).toBe(7);
	expect(archive.bands?.levels[0]).toBe(200);
	expect(archive.request(0, 1)).toBeUndefined();
});

test('peaks whose band levels failed draw plain, and only the levels are asked for again', async () => {
	let isBandsOffline = true;
	const { chunkRequests } = stubArchiveFetch((url) => {
		if (!url.endsWith('.bands')) return chunkOf(7);

		return isBandsOffline ? offline() : levelsOf(200);
	});
	const archive = openWithBands('half-landed-track');

	await archive.request(0, 1);

	expect(archive.peaks.samples[0]).toBe(7);
	expect(archive.pending(0, 1)).toHaveLength(0);
	expect(archive.bands?.levels[0]).toBe(0);
	expect(chunkRequests()).toBe(2);

	isBandsOffline = false;
	await vi.advanceTimersByTimeAsync(2000);
	await archive.request(0, 1);

	expect(chunkRequests()).toBe(3);
	expect(archive.bands?.levels[0]).toBe(200);
	expect(archive.request(0, 1)).toBeUndefined();
});
