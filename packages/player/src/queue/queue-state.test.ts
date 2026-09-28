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

function makeItem(itemId: string): QueueItem {
	return {
		artistLine: 'Nebula Drift',
		itemId,
		releaseTitle: 'Cosmic Drift',
		title: `Track ${itemId}`,
	};
}

const release = [makeItem('a'), makeItem('b'), makeItem('c')];

const nextId = createQueueIds();

function emptyState(): QueueState {
	return { currentIndex: undefined, isShuffling: false, playOrder: [], queue: [] };
}

function orderViolation(state: QueueState): string | undefined {
	const { currentIndex, isShuffling, playOrder, queue } = state;
	const isInRange = (index: number) => index >= 0 && index < queue.length;

	if (playOrder.length !== queue.length || new Set(playOrder).size !== queue.length) {
		return 'play order is not one entry per queue position';
	}
	if (playOrder.some((index) => !isInRange(index))) return 'play order points outside the queue';
	if (!isShuffling && playOrder.some((index, position) => index !== position)) {
		return 'an unshuffled play order is out of queue order';
	}
	if (currentIndex !== undefined && !isInRange(currentIndex)) {
		return 'loaded index is outside the queue';
	}

	return undefined;
}

// Seeded, so a failure replays the same sequence of steps
function seededRandom(seed: number): () => number {
	let state = seed;

	return () => {
		state = (state * 16_807) % 2_147_483_647;

		return state / 2_147_483_647;
	};
}

function stamp(items: ReadonlyArray<QueueItem>): Array<QueuedItem> {
	return stampQueue(items, nextId);
}

function trackIds(queue: ReadonlyArray<QueuedItem>): Array<string> {
	return queue.map((item) => item.itemId);
}

function withQueue(items: ReadonlyArray<QueueItem>, currentIndex: number | undefined): QueueState {
	const loaded = loadedQueue(emptyState(), stamp(items));

	return { ...loaded, currentIndex };
}

describe('loadedQueue', () => {
	test('replaces the queue and loads nothing out of it', () => {
		const state = loadedQueue(emptyState(), stamp(release));

		expect(trackIds(state.queue)).toStrictEqual(['a', 'b', 'c']);
		expect(state.playOrder).toStrictEqual([0, 1, 2]);
		expect(state.currentIndex).toBeUndefined();
	});
});

describe('appendedQueue', () => {
	test('fills an empty queue and loads its head when no track is named', () => {
		const appended = appendedQueue(emptyState(), stamp(release));

		expect(appended?.loadIndex).toBe(0);
		expect(trackIds(appended?.state.queue ?? [])).toStrictEqual(['a', 'b', 'c']);
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

	test('leaves the loaded index alone, since loading it is the caller step', () => {
		const appended = appendedQueue(withQueue(release, 1), stamp([makeItem('d')]));

		expect(appended?.state.currentIndex).toBe(1);
		expect(appended?.loadIndex).toBe(3);
	});

	test('keeps a shuffled order and puts every appended track at its end', () => {
		const shuffling = { ...withQueue(release, 2), isShuffling: true, playOrder: [2, 0, 1] };
		const appended = appendedQueue(shuffling, stamp([makeItem('d'), makeItem('e')]));

		expect(appended?.loadIndex).toBe(3);
		expect(appended?.state.playOrder).toStrictEqual([2, 0, 1, 3, 4]);
	});

	test('puts a named track at the end of a shuffled order', () => {
		const shuffling = { ...withQueue(release, 2), isShuffling: true, playOrder: [2, 0, 1] };
		const appended = appendedQueue(shuffling, stamp([makeItem('d'), makeItem('e')]), 'e');

		expect(trackIds(appended?.state.queue ?? [])).toStrictEqual(['a', 'b', 'c', 'e']);
		expect(appended?.state.playOrder).toStrictEqual([2, 0, 1, 3]);
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

	test('answers nothing when the page carries the same fields in another key order', () => {
		const queue = stamp([
			{ ...makeItem('a'), cuePoints: [{ artistLine: 'Kin', startSeconds: 0, title: 'Open' }] },
		]);
		const fresh = Object.assign(
			{ title: 'Track a' },
			{
				...makeItem('a'),
				cuePoints: [Object.assign({ title: 'Open' }, { artistLine: 'Kin', startSeconds: 0 })],
			},
		);

		expect(refreshedQueue(queue, [fresh])).toBeUndefined();
	});

	test('answers nothing when the page carries a key holding undefined that storage dropped', () => {
		const fresh = makeItem('a');

		Reflect.set(fresh, 'releaseHref', undefined);

		expect(refreshedQueue(stamp([makeItem('a')]), [fresh])).toBeUndefined();
	});

	test('refreshes an item whose nested field changed', () => {
		const queue = stamp([
			{ ...makeItem('a'), cuePoints: [{ artistLine: 'Kin', startSeconds: 0, title: 'Open' }] },
		]);
		const fresh = {
			...makeItem('a'),
			cuePoints: [{ artistLine: 'Kin', startSeconds: 5, title: 'Open' }],
		};

		expect(refreshedQueue(queue, [fresh])?.[0]).toStrictEqual({
			...fresh,
			queueId: queue[0]?.queueId,
		});
	});

	test('refreshes an item that gained or lost a field', () => {
		const queue = stamp([{ ...makeItem('a'), trackCount: 12 }]);

		expect(refreshedQueue(queue, [makeItem('a')])).toBeDefined();
		expect(
			refreshedQueue(stamp([makeItem('a')]), [{ ...makeItem('a'), trackCount: 12 }]),
		).toBeDefined();
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

	test('remaps a shuffled order rather than reshuffling it', () => {
		const shuffling = { ...withQueue(release, 0), isShuffling: true, playOrder: [0, 2, 1] };
		const state = removedAt(shuffling, 0);

		expect(state.playOrder).toStrictEqual([1, 0]);
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

describe('queue transitions', () => {
	// The persisted reader drops a shuffled order that is not a permutation, so a violation silently reshuffles on reload
	test('keep the play order a permutation of the queue through any sequence of actions', () => {
		const random = seededRandom(1);
		const pick = (count: number) => Math.floor(random() * count);
		const itemIds = ['a', 'b', 'c', 'd', 'e'];
		const someRelease = () =>
			stamp(Array.from({ length: 1 + pick(4) }, (_, index) => makeItem(itemIds[index] ?? 'a')));

		const steps: Array<(state: QueueState) => QueueState> = [
			(state) => {
				const itemId = pick(2) === 0 ? undefined : (itemIds[pick(itemIds.length + 1)] ?? 'missing');
				const appended = appendedQueue(state, someRelease(), itemId);
				if (!appended) return state;

				return pick(2) === 0
					? { ...appended.state, currentIndex: appended.loadIndex }
					: appended.state;
			},
			(state) => loadedQueue(state, someRelease()),
			(state) => {
				const from = pick(state.queue.length);
				const to = pick(state.queue.length);

				return from === to ? state : movedItem(state, from, to);
			},
			(state) => (state.queue.length === 0 ? state : removedAt(state, pick(state.queue.length))),
			(state) => shuffledQueue(state, !state.isShuffling),
			(state) => ({ ...emptyState(), isShuffling: state.isShuffling }),
			(state) =>
				state.queue.length === 0 ? state : { ...state, currentIndex: pick(state.queue.length) },
		];

		for (let run = 0; run < 2000; run += 1) {
			let state = emptyState();

			for (let step = 0; step < 12; step += 1) {
				state = steps[pick(steps.length)]?.(state) ?? state;

				expect(orderViolation(state), JSON.stringify(state)).toBeUndefined();
			}
		}
	});
});
