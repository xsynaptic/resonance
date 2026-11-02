import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StoredOrderRecord } from '#test/player-store.ts';
import type { QueueItem } from '#types.ts';

import { queueItemsStorageKey, queueStorageKey } from '#constants.ts';
import {
	fake,
	hidePage,
	makeItem,
	persisted,
	release,
	resetEngine,
	storeQueue,
} from '#test/player-store.ts';

// The position drifting between queue changes goes out on `pagehide`
function leavePage(): void {
	window.dispatchEvent(new Event('pagehide'));
}

function storedItems(): Record<string, QueueItem> {
	return JSON.parse(localStorage.getItem(queueItemsStorageKey) ?? '{}') as Record<
		string,
		QueueItem
	>;
}

function storedOrder(): null | StoredOrderRecord {
	return JSON.parse(localStorage.getItem(queueStorageKey) ?? 'null') as null | StoredOrderRecord;
}

beforeEach(resetEngine);

describe('queue persistence', () => {
	test('writes the queue as it changes, and clears it when the queue empties', () => {
		const store = persisted();

		store.getState().playTrack(release, 'b');

		expect(storedOrder()?.itemIds).toStrictEqual(['a', 'b', 'c']);
		expect(storedOrder()?.currentIndex).toBe(1);
		expect(Object.keys(storedItems())).toStrictEqual(['a', 'b', 'c']);

		store.getState().clearQueue();
		expect(localStorage.getItem(queueStorageKey)).toBeNull();
		expect(localStorage.getItem(queueItemsStorageKey)).toBeNull();
	});

	test('an advance, a reorder and a shuffle write the order and leave the items alone', () => {
		const store = persisted();

		store.getState().playTrack(release, 'a');

		const setItem = vi.spyOn(localStorage, 'setItem');

		store.getState().next();
		store.getState().moveItem(0, 2);
		store.getState().toggleShuffle();

		expect(setItem.mock.calls.map(([key]) => key)).toStrictEqual([
			queueStorageKey,
			queueStorageKey,
			queueStorageKey,
		]);
		expect(storedOrder()?.itemIds).toStrictEqual(['b', 'c', 'a']);

		setItem.mockRestore();
		localStorage.clear();
	});

	test('writes the items when one is added, removed or refreshed', () => {
		const store = persisted();

		store.getState().loadQueue(release);
		store.getState().queueTrack([makeItem('d')], 'd');

		expect(Object.keys(storedItems())).toStrictEqual(['a', 'b', 'c', 'd']);

		store.getState().removeAt(0);

		expect(Object.keys(storedItems())).toStrictEqual(['b', 'c', 'd']);

		store.getState().refreshQueue([{ ...makeItem('b'), title: 'Fresh' }]);

		expect(storedItems().b?.title).toBe('Fresh');

		localStorage.clear();
	});

	test('restores an id stored twice as two rows, and follows the loaded one', () => {
		localStorage.setItem(
			queueStorageKey,
			JSON.stringify({ currentIndex: 2, currentTimeSeconds: 42, itemIds: ['a', 'b', 'a'] }),
		);
		localStorage.setItem(
			queueItemsStorageKey,
			JSON.stringify({ a: makeItem('a'), b: makeItem('b') }),
		);

		const { currentIndex, queue } = persisted().getState();

		expect(queue.map((item) => item.itemId)).toStrictEqual(['a', 'b', 'a']);
		expect(new Set(queue.map((item) => item.queueId)).size).toBe(3);
		expect(currentIndex).toBe(2);

		localStorage.clear();
	});

	test('drops a stored id that has no item and follows the loaded one past it', () => {
		localStorage.setItem(
			queueStorageKey,
			JSON.stringify({ currentIndex: 2, currentTimeSeconds: 42, itemIds: ['a', 'gone', 'c'] }),
		);
		localStorage.setItem(
			queueItemsStorageKey,
			JSON.stringify({ a: makeItem('a'), c: makeItem('c') }),
		);

		const store = persisted();

		expect(store.getState().queue.map((item) => item.itemId)).toStrictEqual(['a', 'c']);
		expect(store.getState()).toMatchObject({ currentIndex: 1, currentTimeSeconds: 42 });

		localStorage.clear();
	});

	test('leaves a queue another tab saved when a store that held nothing unloads', () => {
		persisted();

		const saved = JSON.stringify({ itemIds: ['a', 'b', 'c'] });

		localStorage.setItem(queueStorageKey, saved);
		leavePage();

		expect(localStorage.getItem(queueStorageKey)).toBe(saved);

		localStorage.removeItem(queueStorageKey);
	});

	test('clears a restored queue once it is emptied', () => {
		const first = persisted();

		first.getState().loadQueue(release);

		resetEngine();

		const second = persisted();

		second.getState().clearQueue();

		expect(localStorage.getItem(queueStorageKey)).toBeNull();
	});

	test('restores the queue and its position without loading anything', () => {
		const first = persisted();

		first.getState().playTrack(release, 'b');
		first.getState().seek(42);
		leavePage();

		resetEngine();

		const second = persisted();

		const state = second.getState();

		expect(state.queue.map((item) => item.itemId)).toStrictEqual(['a', 'b', 'c']);
		expect(state.currentIndex).toBe(1);
		expect(state.currentTimeSeconds).toBe(42);
		expect(state.status).toBe('idle');
		expect(fake.engine.load).not.toHaveBeenCalled();

		localStorage.removeItem(queueStorageKey);
	});

	test('loads a restored track at the stored position on the first press', async () => {
		const first = persisted();

		first.getState().playTrack(release, 'b');
		first.getState().seek(42);
		leavePage();

		resetEngine();

		const second = persisted();

		second.getState().togglePaused();

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				resumeAtSeconds: 42,
				src: 'https://api.test/tracks/b/stream',
			});
		});

		localStorage.removeItem(queueStorageKey);
	});

	test('restarts a restored track past the threshold rather than stepping back', () => {
		const first = persisted();

		first.getState().playTrack(release, 'b');
		first.getState().seek(42);
		leavePage();

		resetEngine();

		const second = persisted();

		second.getState().previous();

		expect(second.getState().currentIndex).toBe(1);
		expect(second.getState().currentTimeSeconds).toBe(0);
		expect(fake.engine.load).not.toHaveBeenCalled();

		localStorage.removeItem(queueStorageKey);
	});

	test('stamps a restored queue with fresh ids rather than the ones it was stored with', () => {
		const first = persisted();

		first.getState().loadQueue(release);

		resetEngine();

		const second = persisted();

		second.getState().playTrack([makeItem('d')], 'd');

		const ids = second.getState().queue.map((item) => item.queueId);

		expect(new Set(ids).size).toBe(ids.length);

		localStorage.removeItem(queueStorageKey);
	});

	test('ignores a stored entry whose index falls outside the queue', () => {
		storeQueue(release, { currentIndex: 9, currentTimeSeconds: 42, isShuffling: false });

		const store = persisted();

		expect(store.getState().queue).toHaveLength(3);
		expect(store.getState().currentIndex).toBeUndefined();
		expect(store.getState().currentTimeSeconds).toBe(0);

		localStorage.clear();
	});

	// Earlier stores in this file still listen, so a first flush settles whatever they hold unsaved
	test('leaves a queue another tab saved when a store that never moved unloads', () => {
		const first = persisted();

		first.getState().loadQueue(release);

		resetEngine();

		const second = persisted();
		const saved = JSON.stringify({ itemIds: ['y'] });

		leavePage();
		localStorage.setItem(queueStorageKey, saved);
		leavePage();

		expect(localStorage.getItem(queueStorageKey)).toBe(saved);

		second.getState().seek(30);
		leavePage();

		expect(storedOrder()?.currentTimeSeconds).toBe(30);

		localStorage.removeItem(queueStorageKey);
	});

	test('flushes the position when the page goes hidden', () => {
		const store = persisted();

		store.getState().playTrack(release, 'b');
		store.getState().seek(42);
		hidePage();

		expect(storedOrder()?.currentTimeSeconds).toBe(42);

		localStorage.removeItem(queueStorageKey);
	});

	test('writes a shuffle toggle straight away, and a reload keeps its order', () => {
		const random = vi.spyOn(Math, 'random').mockReturnValue(0);
		const first = persisted();

		first.getState().loadQueue([...release, makeItem('d')]);
		first.getState().toggleShuffle();

		const { playOrder } = first.getState();

		expect(storedOrder()).toMatchObject({ isShuffling: true, playOrder });

		random.mockReturnValue(0.99);
		resetEngine();

		const second = persisted();

		expect(second.getState().playOrder).toStrictEqual(playOrder);

		random.mockRestore();
		localStorage.removeItem(queueStorageKey);
	});

	test('reshuffles a stored order that is not a permutation of the queue', () => {
		storeQueue(release, { isShuffling: true, playOrder: [0, 0, 1] });

		const store = persisted();

		expect(store.getState().playOrder.toSorted((left, right) => left - right)).toStrictEqual([
			0, 1, 2,
		]);

		localStorage.clear();
	});

	test('drops a malformed stored item and follows the loaded one past it', () => {
		localStorage.setItem(
			queueStorageKey,
			JSON.stringify({ currentIndex: 2, currentTimeSeconds: 42, itemIds: ['a', 'b', 'c'] }),
		);
		localStorage.setItem(
			queueItemsStorageKey,
			JSON.stringify({ a: makeItem('a'), b: { itemId: 5 }, c: makeItem('c') }),
		);

		const store = persisted();

		expect(store.getState().queue.map((item) => item.itemId)).toStrictEqual(['a', 'c']);
		expect(store.getState()).toMatchObject({ currentIndex: 1, currentTimeSeconds: 42 });

		localStorage.clear();
	});

	test('ignores a stored index that is not a whole number', () => {
		storeQueue(release, { currentIndex: 1.5, currentTimeSeconds: 42 });

		const store = persisted();

		expect(store.getState()).toMatchObject({ currentIndex: undefined, currentTimeSeconds: 0 });

		localStorage.clear();
	});

	test('restores a stored entry that carries no shuffle flag', () => {
		storeQueue(release, { currentIndex: 0, currentTimeSeconds: 0 });

		const store = persisted();

		expect(store.getState().isShuffling).toBe(false);

		localStorage.clear();
	});
});
