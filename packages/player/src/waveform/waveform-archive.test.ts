import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { QueueItem } from '#types.ts';

import { openArchive } from '#waveform/waveform-archive.ts';

const archiveUrl = 'https://files.test/waveform/a.dat';
const headerRange = 'bytes=0-19';

function header(): ArrayBuffer {
	const view = new DataView(new ArrayBuffer(20));

	view.setInt32(0, 1, true);
	view.setUint32(4, 1, true);
	view.setInt32(8, 44_100, true);
	view.setInt32(12, 441, true);
	view.setUint32(16, 20_000, true);

	return view.buffer;
}

function itemFor(trackId: string): QueueItem {
	return { albumLoudness: {}, artistLine: '', loudness: {}, releaseTitle: '', title: '', trackId };
}

function rangeOf(init: RequestInit | undefined): string | undefined {
	return (init?.headers as Record<string, string> | undefined)?.Range;
}

const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
	rangeOf(init) === headerRange
		? Promise.resolve(new Response(header(), { status: 206 }))
		: Promise.reject(new TypeError('Failed to fetch')),
);

function chunkRequests(): number {
	return fetchMock.mock.calls.filter(([, init]) => rangeOf(init) !== headerRange).length;
}

function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['performance'] });
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	fetchMock.mockClear();
});

test('chunks asked for as the header lands carry its wait, and later ones their own', async () => {
	const openedMs = performance.now();
	const opening = openArchive(() => Promise.resolve(archiveUrl), itemFor('slow-header'));

	vi.advanceTimersByTime(600);

	const archive = await opening;
	if (!archive) throw new Error('The header did not open');

	archive.want(0, 100);
	vi.advanceTimersByTime(100);
	archive.want(9000, 9100);

	expect(archive.missing(0, 9100).map((chunk) => chunk.askedMs)).toStrictEqual([
		openedMs,
		openedMs + 700,
	]);
});

test('a chunk that fails waits longer each time before it is asked for again', async () => {
	const archive = await openArchive(() => Promise.resolve(archiveUrl), itemFor('offline-track'));
	if (!archive) throw new Error('The header did not open');

	archive.want(0, 100);
	await settle();
	archive.want(0, 100);
	expect(chunkRequests()).toBe(1);

	vi.advanceTimersByTime(2000);
	archive.want(0, 100);
	await settle();
	expect(chunkRequests()).toBe(2);

	vi.advanceTimersByTime(2000);
	archive.want(0, 100);
	expect(chunkRequests()).toBe(2);

	vi.advanceTimersByTime(2000);
	archive.want(0, 100);
	expect(chunkRequests()).toBe(3);
});
