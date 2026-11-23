import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { PeaksReader } from '#waveform/waveform-peaks.ts';

import { chunkOf, offline, stubPeaksFetch } from '#test/peaks-fetch.ts';
import { openPeaks } from '#waveform/waveform-peaks.ts';

// 200 seconds in chunks of 81.92, so the third chunk is short
function open(name: string): PeaksReader {
	return openPeaks({
		byteOffset: 24,
		pairCount: 20_000,
		pairsPerSecond: 100,
		rmsRange: [4, 40],
		url: `https://files.test/waveform/${name}.peaks.bin`,
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
	const { chunkRequests } = stubPeaksFetch(offline);
	const reader = open('unasked');

	expect(chunkRequests()).toBe(0);
	expect(reader.durationSeconds).toBe(200);

	void reader.request(0, 1);
	void reader.request(90, 91);
	void reader.request(0, 1);

	expect(reader.pending(0, 91)).toStrictEqual([
		[0, 81.92],
		[81.92, 163.84],
	]);
	expect(chunkRequests()).toBe(2);
});

test('the last chunk is pending only as far as the peaks run, and asks for no byte past it', () => {
	const { rangeRequests } = stubPeaksFetch(offline);
	const reader = open('short-tail');

	void reader.request(190, 500);

	expect(reader.pending(190, 500)).toStrictEqual([[163.84, 200]]);
	expect(rangeRequests()).toStrictEqual(['bytes=49176-60023']);
});

test('a window with a gap settles only once a chunk has its samples in place', async () => {
	stubPeaksFetch(() => chunkOf(7));

	const reader = open('landing-track');
	const landing = reader.request(0, 1);

	expect(reader.request(0, 1)).toBe(landing);
	expect(reader.pending(0, 1)).toHaveLength(1);

	await landing;
	expect(reader.peaks.samples[0]).toBe(7);
	expect(reader.pending(0, 1)).toHaveLength(0);
	expect(reader.request(0, 1)).toBeUndefined();
});

test('a landed chunk splits into min and max for the samples and one RMS per pair', async () => {
	const pairs = new Int8Array(8192 * 3);

	for (let pair = 0; pair < 8192; pair += 1) pairs.set([-50, 60, 20], pair * 3);

	stubPeaksFetch(() => Promise.resolve(new Response(pairs, { status: 206 })));

	const reader = open('split-track');

	await reader.request(0, 1);

	expect([...reader.peaks.samples.subarray(0, 4)]).toStrictEqual([-50, 60, -50, 60]);
	expect([...(reader.peaks.rms?.subarray(0, 2) ?? [])]).toStrictEqual([20, 20]);
	expect(reader.peaks.rms?.[8192]).toBe(0);
	expect(reader.peaksWithoutBody.samples).toBe(reader.peaks.samples);
	expect(reader.peaksWithoutBody.rms).toBeUndefined();
});

test('a chunk that fails is asked for again as its window settles, after a wait that doubles', async () => {
	const { chunkRequests } = stubPeaksFetch(offline);
	const reader = open('offline-track');
	const askAgain = (): void => {
		void reader.request(0, 1)?.then(askAgain);
	};

	askAgain();

	await vi.advanceTimersByTimeAsync(1999);
	void reader.request(0, 1);
	expect(chunkRequests()).toBe(1);

	await vi.advanceTimersByTimeAsync(1);
	expect(chunkRequests()).toBe(2);

	await vi.advanceTimersByTimeAsync(3999);
	expect(chunkRequests()).toBe(2);

	await vi.advanceTimersByTimeAsync(1);
	expect(chunkRequests()).toBe(3);
});

test('a server that ignores the range lands nothing, and the chunk is asked for again', async () => {
	const { chunkRequests } = stubPeaksFetch(() =>
		Promise.resolve(new Response(new Int8Array(40_000).fill(7), { status: 200 })),
	);
	const reader = open('range-ignored');

	void reader.request(0, 1);
	await vi.advanceTimersByTimeAsync(0);

	expect(reader.peaks.samples[0]).toBe(0);
	expect(reader.pending(0, 1)).toHaveLength(1);

	await vi.advanceTimersByTimeAsync(2000);
	void reader.request(0, 1);

	expect(chunkRequests()).toBe(2);
});

test('keeps only the two readers opened last', () => {
	const first = open('evicted-first');
	const second = open('evicted-second');
	const third = open('evicted-third');

	expect(open('evicted-third')).toBe(third);
	expect(open('evicted-second')).toBe(second);
	expect(open('evicted-first')).not.toBe(first);
});

function openWithBands(name: string): PeaksReader {
	return openPeaks({
		bands: {
			bandCount: 3,
			byteOffset: 36,
			frameCount: 5000,
			framesPerSecond: 25,
			medians: [180, 140, 100],
			minDecibels: -60,
			url: `https://files.test/waveform/${name}.bands.bin`,
		},
		byteOffset: 24,
		pairCount: 20_000,
		pairsPerSecond: 100,
		rmsRange: [4, 40],
		url: `https://files.test/waveform/${name}.peaks.bin`,
	});
}

function levelsOf(level: number): Promise<Response> {
	return Promise.resolve(new Response(new Uint8Array(2048 * 3).fill(level), { status: 206 }));
}

test('a chunk lands with its band levels already in place, each read from past its own header', async () => {
	const { rangeRequests } = stubPeaksFetch((url) =>
		url.endsWith('.bands.bin') ? levelsOf(200) : chunkOf(7),
	);
	const reader = openWithBands('tinted-track');

	expect(reader.bands).toMatchObject({ bandCount: 3, framesPerSecond: 25, minDecibels: -60 });
	expect(reader.bands?.levels[0]).toBe(0);

	await reader.request(0, 1);

	expect(rangeRequests()).toStrictEqual(['bytes=36-6179', 'bytes=24-24599']);
	expect(reader.peaks.samples[0]).toBe(7);
	expect(reader.bands?.levels[0]).toBe(200);
	expect(reader.request(0, 1)).toBeUndefined();
});

test('peaks whose band levels failed draw plain, and only the levels are asked for again', async () => {
	let isBandsOffline = true;
	const { chunkRequests } = stubPeaksFetch((url) => {
		if (!url.endsWith('.bands.bin')) return chunkOf(7);

		return isBandsOffline ? offline() : levelsOf(200);
	});
	const reader = openWithBands('half-landed-track');

	await reader.request(0, 1);

	expect(reader.peaks.samples[0]).toBe(7);
	expect(reader.pending(0, 1)).toHaveLength(0);
	expect(reader.bands?.levels[0]).toBe(0);
	expect(chunkRequests()).toBe(2);

	isBandsOffline = false;
	await vi.advanceTimersByTimeAsync(2000);
	await reader.request(0, 1);

	expect(chunkRequests()).toBe(3);
	expect(reader.bands?.levels[0]).toBe(200);
	expect(reader.request(0, 1)).toBeUndefined();
});
