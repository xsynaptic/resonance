import type { StoreApi } from 'zustand/vanilla';

import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerUrls, QueueItem, QueueItemDetail } from '#types.ts';

import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { isDetailPending } from '#store/selectors.ts';

const detailStorageKey = 'player:v1:queue-detail';

const strip: QueueItemDetail = { waveformOverview: [0.2, 0.8] };

function makeItem(itemId: string): QueueItem {
	return { artistLine: 'Nebula Drift', itemId, releaseTitle: 'Cosmic Drift', title: itemId };
}

function createStore(
	detail: PlayerUrls['detail'],
	{ isPersistent = false } = {},
): StoreApi<PlayerStore> {
	const store = createWritablePlayerStore({
		createEngine: createMockEngine().createEngine,
		isPersistent,
	});

	store.getState().configure({
		urls: {
			detail,
			stream: ({ itemId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${itemId}` }),
		},
	});

	return store;
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
	localStorage.clear();
});

describe('queued detail', () => {
	test('is awaited from the press until the host answers, then held by item id', async () => {
		const answer = Promise.withResolvers<QueueItemDetail>();
		const store = createStore(() => answer.promise);

		expect(isDetailPending(store.getState())).toBe(false);

		store.getState().playTrack([makeItem('a')], 'a');
		await settle();

		expect(isDetailPending(store.getState())).toBe(true);

		answer.resolve(strip);
		await settle();

		expect(isDetailPending(store.getState())).toBe(false);
		expect(store.getState().details.get('a')).toBe(strip);
	});

	test.each([
		['rejects', () => Promise.reject(new Error('offline'))],
		['has nothing', () => Promise.resolve(undefined)],
	])('stops waiting when the host %s', async (_outcome, detail) => {
		const store = createStore(detail);

		store.getState().playTrack([makeItem('a')], 'a');
		await settle();

		expect(isDetailPending(store.getState())).toBe(false);
		expect(store.getState().details.get('a')).toStrictEqual({});
	});

	test('never waits on a host that resolves no detail', () => {
		const store = createStore(undefined);

		store.getState().playTrack([makeItem('a')], 'a');

		expect(isDetailPending(store.getState())).toBe(false);
	});

	test('leaves with its item, and is asked for again when the item is queued again', async () => {
		const detail = vi.fn(() => Promise.resolve(strip));
		const store = createStore(detail);

		store.getState().playTrack([makeItem('a'), makeItem('b')], 'a');
		await settle();
		store.getState().moveItem(0, 1);

		expect(detail).toHaveBeenCalledTimes(2);

		store.getState().removeAt(0);

		expect([...store.getState().details.keys()]).toStrictEqual(['a']);

		store.getState().queueTrack([makeItem('b')], 'b');
		await settle();

		expect(detail).toHaveBeenCalledTimes(3);
		expect(store.getState().details.get('b')).toBe(strip);
	});
});

describe('detail persistence', () => {
	test('restores a queued detail before the host is asked, and keeps it when the host fails', async () => {
		const first = createStore(() => Promise.resolve(strip), { isPersistent: true });

		first.getState().loadQueue([makeItem('a')]);
		await settle();

		const second = createStore(() => Promise.reject(new Error('offline')), { isPersistent: true });

		expect(isDetailPending(second.getState())).toBe(false);
		expect(second.getState().details.get('a')).toStrictEqual(strip);

		await settle();

		expect(second.getState().details.get('a')).toStrictEqual(strip);
	});

	test('replaces a restored detail with a newer answer, in the store and in storage', async () => {
		const newer: QueueItemDetail = { waveformOverview: [0.5, 0.5] };
		const first = createStore(() => Promise.resolve(strip), { isPersistent: true });

		first.getState().loadQueue([makeItem('a')]);
		await settle();

		const second = createStore(() => Promise.resolve(newer), { isPersistent: true });

		await settle();

		expect(second.getState().details.get('a')).toBe(newer);
		expect(JSON.parse(localStorage.getItem(detailStorageKey) ?? '{}')).toStrictEqual({ a: newer });
	});

	test('writes nothing back when the host answers with what storage already held', async () => {
		const first = createStore(() => Promise.resolve(strip), { isPersistent: true });

		first.getState().loadQueue([makeItem('a')]);
		await settle();

		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const second = createStore(() => Promise.resolve({ ...strip }), { isPersistent: true });

		await settle();

		expect(second.getState().details.get('a')).toStrictEqual(strip);
		expect(setItem).not.toHaveBeenCalled();

		setItem.mockRestore();
	});

	test('clears the entry as the queue empties', async () => {
		const store = createStore(() => Promise.resolve(strip), { isPersistent: true });

		store.getState().loadQueue([makeItem('a')]);
		await settle();

		expect(localStorage.getItem(detailStorageKey)).not.toBeNull();

		store.getState().clearQueue();

		expect(localStorage.getItem(detailStorageKey)).toBeNull();
	});
});
