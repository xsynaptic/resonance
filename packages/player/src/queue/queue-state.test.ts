import { describe, expect, test } from 'vitest';

import type { QueueState } from '#queue/queue-state.ts';
import type { QueuedItem, QueueItem } from '#types.ts';

import {
	appendedQueue,
	createQueueIds,
	loadedQueue,
	movedItem,
	removedAt,
	replacedAfter,
	shuffledQueue,
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

function trackIds(queue: ReadonlyArray<QueuedItem>): Array<string> {
	return queue.map((item) => item.trackId);
}

function withQueue(items: ReadonlyArray<QueueItem>, currentIndex: number | undefined): QueueState {
	const loaded = loadedQueue(emptyState(), items, nextId);

	return { ...loaded, currentIndex };
}

describe('createQueueIds', () => {
	test('stamps an id that is unique within the queue', () => {
		const ids = createQueueIds();
		const queue = loadedQueue(emptyState(), release, ids).queue;

		expect(new Set(queue.map((item) => item.queueId)).size).toBe(3);
	});
});

describe('loadedQueue', () => {
	test('replaces the queue and loads nothing out of it', () => {
		const state = loadedQueue(emptyState(), release, nextId);

		expect(trackIds(state.queue)).toStrictEqual(['a', 'b', 'c']);
		expect(state.playOrder).toStrictEqual([0, 1, 2]);
		expect(state.currentIndex).toBeUndefined();
	});

	test('drops shuffle for a sectioned queue', () => {
		const shuffling = { ...emptyState(), isShuffling: true };
		const sectioned = [makeItem('a', 'Side one'), makeItem('b')];

		expect(loadedQueue(shuffling, sectioned, nextId).isShuffling).toBe(false);
		expect(loadedQueue(shuffling, release, nextId).isShuffling).toBe(true);
	});
});

describe('appendedQueue', () => {
	test('fills an empty queue and loads its head when no track is named', () => {
		const appended = appendedQueue(emptyState(), release, nextId);

		expect(appended?.loadIndex).toBe(0);
		expect(trackIds(appended?.state.queue ?? [])).toStrictEqual(['a', 'b', 'c']);
	});

	test('fills an empty queue and loads the named track', () => {
		const appended = appendedQueue(emptyState(), release, nextId, 'b');

		expect(appended?.loadIndex).toBe(1);
		expect(appended?.state.queue).toHaveLength(3);
	});

	test('refuses a named track the release does not carry', () => {
		expect(appendedQueue(emptyState(), release, nextId, 'z')).toBeUndefined();
	});

	test('appends every track to a running queue and loads the first appended', () => {
		const appended = appendedQueue(withQueue([makeItem('x')], 0), release, nextId);

		expect(appended?.loadIndex).toBe(1);
		expect(trackIds(appended?.state.queue ?? [])).toStrictEqual(['x', 'a', 'b', 'c']);
	});

	test('jumps to a track already queued rather than appending a second copy', () => {
		const running = withQueue(release, 0);
		const appended = appendedQueue(running, release, nextId, 'c');

		expect(appended?.loadIndex).toBe(2);
		expect(appended?.state).toBe(running);
	});

	test('appends only the named track when a queue is running', () => {
		const appended = appendedQueue(withQueue([makeItem('x')], 0), release, nextId, 'c');

		expect(appended?.loadIndex).toBe(1);
		expect(trackIds(appended?.state.queue ?? [])).toStrictEqual(['x', 'c']);
	});

	test('refuses an empty release', () => {
		expect(appendedQueue(emptyState(), [], nextId)).toBeUndefined();
	});

	test('leaves the loaded index alone, since loading it is the caller step', () => {
		const appended = appendedQueue(withQueue(release, 1), [makeItem('d')], nextId);

		expect(appended?.state.currentIndex).toBe(1);
		expect(appended?.loadIndex).toBe(3);
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

describe('replacedAfter', () => {
	test('keeps the loaded track and everything before it', () => {
		const state = replacedAfter(withQueue(release, 1), 1, [makeItem('d')], nextId);

		expect(trackIds(state.queue)).toStrictEqual(['a', 'b', 'd']);
		expect(state.currentIndex).toBe(1);
	});

	test('drops shuffle when the replacement is sectioned', () => {
		const shuffling = { ...withQueue(release, 0), isShuffling: true };
		const state = replacedAfter(shuffling, 0, [makeItem('d', 'Side two')], nextId);

		expect(state.isShuffling).toBe(false);
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
