import type { StoreApi } from 'zustand/vanilla';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
}

function offline(): Promise<never> {
	return Promise.reject(new Error('offline'));
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['clearTimeout', 'setTimeout'] });
});

afterEach(() => {
	vi.useRealTimers();
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
		['rejects', offline],
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

describe('detail retry', () => {
	test('asks again after the base delay, and the answer replaces the groove', async () => {
		const detail = vi
			.fn<NonNullable<PlayerUrls['detail']>>()
			.mockImplementationOnce(offline)
			.mockResolvedValue(strip);
		const store = createStore(detail);

		store.getState().playTrack([makeItem('a')], 'a');
		await settle();

		expect(store.getState().details.get('a')).toStrictEqual({});

		await vi.advanceTimersByTimeAsync(1999);

		expect(detail).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);

		expect(detail).toHaveBeenCalledTimes(2);
		expect(store.getState().details.get('a')).toBe(strip);
	});

	test('doubles the delay up to the cap, and starts over after a success', async () => {
		let isOnline = false;
		const detail = vi.fn(() => (isOnline ? Promise.resolve(strip) : offline()));
		const store = createStore(detail);

		store.getState().playTrack([makeItem('a')], 'a');
		await settle();

		for (const delayMs of [2000, 4000, 8000, 16_000, 30_000, 30_000]) {
			const asked = detail.mock.calls.length;

			await vi.advanceTimersByTimeAsync(delayMs - 1);

			expect(detail).toHaveBeenCalledTimes(asked);

			await vi.advanceTimersByTimeAsync(1);

			expect(detail).toHaveBeenCalledTimes(asked + 1);
		}

		isOnline = true;
		await vi.advanceTimersByTimeAsync(30_000);

		expect(store.getState().details.get('a')).toBe(strip);

		isOnline = false;
		store.getState().queueTrack([makeItem('b')], 'b');
		await settle();

		const asked = detail.mock.calls.length;

		await vi.advanceTimersByTimeAsync(2000);

		expect(detail).toHaveBeenCalledTimes(asked + 1);
	});

	test('waits out one delay for every item the host failed, and asks for them together', async () => {
		const detail = vi.fn<NonNullable<PlayerUrls['detail']>>(offline);
		const store = createStore(detail);

		store.getState().playTrack([makeItem('a'), makeItem('b')], 'a');
		await settle();
		await vi.advanceTimersByTimeAsync(2000);
		await vi.advanceTimersByTimeAsync(3999);

		expect(detail.mock.calls.map(([{ itemId }]) => itemId)).toStrictEqual(['a', 'b', 'a', 'b']);
	});

	test('does not ask again for an item the host has nothing for', async () => {
		const detail = vi.fn(() => Promise.resolve(undefined));
		const store = createStore(detail);

		store.getState().playTrack([makeItem('a')], 'a');
		await vi.advanceTimersByTimeAsync(60_000);

		expect(detail).toHaveBeenCalledOnce();
	});

	test('does not ask for an item that left the Queue while its retry was waiting', async () => {
		const detail = vi.fn<NonNullable<PlayerUrls['detail']>>(offline);
		const store = createStore(detail);

		store.getState().playTrack([makeItem('a'), makeItem('b')], 'a');
		await settle();
		store.getState().removeAt(1);
		await vi.advanceTimersByTimeAsync(2000);

		expect(detail.mock.calls.map(([{ itemId }]) => itemId)).toStrictEqual(['a', 'b', 'a']);

		store.getState().clearQueue();

		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('detail persistence', () => {
	test.each([
		['fails', offline],
		['has nothing', () => Promise.resolve(undefined)],
	])('never stores the empty detail of an item the host %s for', async (_outcome, detail) => {
		const store = createStore((item) => (item.itemId === 'a' ? Promise.resolve(strip) : detail()), {
			isPersistent: true,
		});

		store.getState().loadQueue([makeItem('b')]);
		await settle();

		expect(store.getState().details.get('b')).toStrictEqual({});
		expect(localStorage.getItem(detailStorageKey)).toBeNull();

		store.getState().queueTrack([makeItem('a')], 'a');
		await settle();

		expect(JSON.parse(localStorage.getItem(detailStorageKey) ?? '{}')).toStrictEqual({ a: strip });

		store.getState().removeAt(1);

		expect(localStorage.getItem(detailStorageKey)).toBeNull();
	});

	test('an idle tab never deletes the detail another tab saved', () => {
		const store = createStore(() => Promise.resolve(strip), { isPersistent: true });
		const saved = JSON.stringify({ a: strip });

		localStorage.setItem(detailStorageKey, saved);

		store.getState().refreshQueue([makeItem('a')]);
		store.getState().clearQueue();
		store.getState().removeAt(0);
		store.getState().toggleShuffle();
		store.getState().configure({
			urls: { stream: () => Promise.resolve({ status: 'capped' }) },
		});

		const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

		document.dispatchEvent(new Event('visibilitychange'));
		visibility.mockRestore();
		window.dispatchEvent(new Event('pagehide'));

		expect(localStorage.getItem(detailStorageKey)).toBe(saved);
	});

	test('restores a queued detail before the host is asked, and keeps it when the host fails', async () => {
		const first = createStore(() => Promise.resolve(strip), { isPersistent: true });

		first.getState().loadQueue([makeItem('a')]);
		await settle();

		const second = createStore(offline, { isPersistent: true });

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
