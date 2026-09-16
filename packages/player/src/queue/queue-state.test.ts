import { describe, expect, test } from 'vitest';

import type { QueueState } from '#queue/queue-state.ts';
import type { QueuedItem, QueueItem } from '#types.ts';

import {
	appendedQueue,
	createQueueIds,
	loadedQueue,
	movedItem,
	refreshedQueue,
	removedAt,
	shuffledQueue,
	stampQueue,
} from '#queue/queue-state.ts';

function makeItem(trackId: string, sectionLabel?: string): QueueItem {
	return {
		albumLoudness: {},
		artistLine: 'Nebula Drift',
		loudness: {},
		releaseTitle: 'Cosmic Drift',
		title: `Track ${trackId}`,
		trackId,
		...(sectionLabel === undefined ? {} : { sectionLabel }),
	};
}

const release = [makeItem('a'), makeItem('b'), makeItem('c')];

const nextId = createQueueIds();

function emptyState(): QueueState {
	return { currentIndex: undefined, isShuffling: false, playOrder: [], queue: [] };
}

function stamp(items: ReadonlyArray<QueueItem>): Array<QueuedItem> {
	return stampQueue(items, nextId);
}

function trackIds(queue: ReadonlyArray<QueuedItem>): Array<string> {
	return queue.map((item) => item.trackId);
}

function withQueue(items: ReadonlyArray<QueueItem>, currentIndex: number | undefined): QueueState {
	const loaded = loadedQueue(emptyState(), stamp(items));

	return { ...loaded, currentIndex };
}

describe('createQueueIds', () => {
	test('stamps an id that is unique within the queue', () => {
		const ids = createQueueIds();
		const queue = loadedQueue(emptyState(), stampQueue(release, ids)).queue;

		expect(new Set(queue.map((item) => item.queueId)).size).toBe(3);
	});
});

describe('loadedQueue', () => {
	test('replaces the queue and loads nothing out of it', () => {
		const state = loadedQueue(emptyState(), stamp(release));

		expect(trackIds(state.queue)).toStrictEqual(['a', 'b', 'c']);
		expect(state.playOrder).toStrictEqual([0, 1, 2]);
		expect(state.currentIndex).toBeUndefined();
	});

	test('drops shuffle for a sectioned queue', () => {
		const shuffling = { ...emptyState(), isShuffling: true };
		const sectioned = [makeItem('a', 'Side one'), makeItem('b')];

		expect(loadedQueue(shuffling, stamp(sectioned)).isShuffling).toBe(false);
		expect(loadedQueue(shuffling, stamp(release)).isShuffling).toBe(true);
	});
});

describe('appendedQueue', () => {
	test('fills an empty queue and loads its head when no track is named', () => {
		const appended = appendedQueue(emptyState(), stamp(release));

		expect(appended?.loadIndex).toBe(0);
		expect(trackIds(appended?.state.queue ?? [])).toStrictEqual(['a', 'b', 'c']);
	});

	test('fills an empty queue and loads the named track', () => {
		const appended = appendedQueue(emptyState(), stamp(release), 'b');

		expect(appended?.loadIndex).toBe(1);
		expect(appended?.state.queue).toHaveLength(3);
	});

	test('refuses a named track the release does not carry', () => {
		expect(appendedQueue(emptyState(), stamp(release), 'z')).toBeUndefined();
	});

	test('appends every track to a running queue and loads the first appended', () => {
		const appended = appendedQueue(withQueue([makeItem('x')], 0), stamp(release));

		expect(appended?.loadIndex).toBe(1);
		expect(trackIds(appended?.state.queue ?? [])).toStrictEqual(['x', 'a', 'b', 'c']);
	});

	test('jumps to a track already queued rather than appending a second copy', () => {
		const running = withQueue(release, 0);
		const appended = appendedQueue(running, stamp(release), 'c');

		expect(appended?.loadIndex).toBe(2);
		expect(appended?.state).toBe(running);
	});

	test('appends only the named track when a queue is running', () => {
		const appended = appendedQueue(withQueue([makeItem('x')], 0), stamp(release), 'c');

		expect(appended?.loadIndex).toBe(1);
		expect(trackIds(appended?.state.queue ?? [])).toStrictEqual(['x', 'c']);
	});

	test('refuses an empty release', () => {
		expect(appendedQueue(emptyState(), stamp([]))).toBeUndefined();
	});

	test('leaves the loaded index alone, since loading it is the caller step', () => {
		const appended = appendedQueue(withQueue(release, 1), stamp([makeItem('d')]));

		expect(appended?.state.currentIndex).toBe(1);
		expect(appended?.loadIndex).toBe(3);
	});
});

describe('refreshedQueue', () => {
	test('gives a stored item from an older build the page fields, keeping its queue id and place', () => {
		const legacy = { ...makeItem('b'), artworkUrl: '/b-512.webp' };
		const queue = stamp([makeItem('a'), legacy, makeItem('c')]);
		const fresh = { ...makeItem('b'), artwork: [{ src: '/b-120.webp', width: 120 }] };

		const refreshed = refreshedQueue(queue, [fresh]);

		expect(refreshed?.[1]).toStrictEqual({ ...fresh, queueId: queue[1]?.queueId });
		expect(refreshed?.[0]).toBe(queue[0]);
		expect(refreshed?.[2]).toBe(queue[2]);
	});

	test('answers nothing when the page carries the same fields', () => {
		expect(refreshedQueue(stamp(release), release)).toBeUndefined();
	});

	test('answers nothing when the page carries none of the queued tracks', () => {
		expect(refreshedQueue(stamp(release), [makeItem('z')])).toBeUndefined();
	});
});

describe('removedAt', () => {
	test('leaves nothing loaded when the loaded track goes', () => {
		const state = removedAt(withQueue(release, 1), 1);

		expect(trackIds(state.queue)).toStrictEqual(['a', 'c']);
		expect(state.currentIndex).toBeUndefined();
	});

	test('shifts the loaded track down when an earlier one goes', () => {
		expect(removedAt(withQueue(release, 2), 0).currentIndex).toBe(1);
	});

	test('leaves the loaded track where it is when a later one goes', () => {
		expect(removedAt(withQueue(release, 0), 2).currentIndex).toBe(0);
	});
});

describe('movedItem', () => {
	test('moves the row and follows the loaded track', () => {
		const state = movedItem(withQueue(release, 0), 0, 2);

		expect(trackIds(state.queue)).toStrictEqual(['b', 'c', 'a']);
		expect(state.currentIndex).toBe(2);
	});

	test('remaps a shuffled order rather than reshuffling it', () => {
		const shuffling = { ...withQueue(release, 0), isShuffling: true, playOrder: [0, 2, 1] };
		const state = movedItem(shuffling, 0, 2);

		expect(state.playOrder).toStrictEqual([2, 1, 0]);
	});
});

describe('shuffledQueue', () => {
	test('restores the natural order when toggled off', () => {
		const shuffling = { ...withQueue(release, 1), isShuffling: true, playOrder: [1, 2, 0] };

		expect(shuffledQueue(shuffling, false).playOrder).toStrictEqual([0, 1, 2]);
	});

	test('puts the loaded track first when toggled on', () => {
		expect(shuffledQueue(withQueue(release, 1), true).playOrder[0]).toBe(1);
	});
});
