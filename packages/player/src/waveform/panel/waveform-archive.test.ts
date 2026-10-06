import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { QueueItem } from '#types.ts';
import type { WaveformArchive } from '#waveform/panel/waveform-archive.ts';

import { chunkOf, offline, stubArchiveFetch } from '#test/archive-fetch.ts';
import { openArchive } from '#waveform/panel/waveform-archive.ts';

const archiveUrl = 'https://files.test/waveform/a.dat';

function itemFor(itemId: string): QueueItem {
	return { artistLine: '', itemId, releaseTitle: '', title: '' };
}

async function open(itemId: string): Promise<WaveformArchive> {
	const archive = await openArchive(() => Promise.resolve(archiveUrl), itemFor(itemId));
	if (!archive) throw new Error('The header did not open');

	return archive;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['clearTimeout', 'performance', 'setTimeout'] });
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test('chunks asked for as the header lands carry its wait, and later ones their own', async () => {
	stubArchiveFetch(offline);

	const openedMs = performance.now();
	const opening = open('slow-header');

	vi.advanceTimersByTime(600);

	const archive = await opening;

	void archive.want(0, 100);
	vi.advanceTimersByTime(100);
	void archive.want(9000, 9100);

	expect(archive.missing(0, 9100).map((chunk) => chunk.askedMs)).toStrictEqual([
		openedMs,
		openedMs + 700,
	]);
});

test('a span with a gap settles only once a chunk has its samples in place', async () => {
	stubArchiveFetch(() => chunkOf(7));

	const archive = await open('landing-track');
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
	const archive = await open('offline-track');
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
