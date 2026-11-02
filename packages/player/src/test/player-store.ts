import type { StoreApi } from 'zustand/vanilla';

import { vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerUrls, QueueItem, StreamResolution } from '#types.ts';

import { queueItemsStorageKey, queueStorageKey } from '#constants.ts';
import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { createMemoryStorage } from '#lib/storage.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';

export interface StoredOrderRecord {
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	isShuffling: boolean;
	itemIds: Array<string>;
	playOrder: Array<number>;
}

// Replaced per test, so nothing a store did survives into the next one
export let fake = createMockEngine();

export function resetEngine(): void {
	fake = createMockEngine();
}

export function makeItem(id: string): QueueItem {
	return {
		artistLine: 'Nebula Drift',
		durationMs: 180_000,
		itemId: id,
		releaseHref: '/releases/cosmic-drift',
		releaseTitle: 'Cosmic Drift',
		title: `Track ${id}`,
	};
}

export const release = [makeItem('a'), makeItem('b'), makeItem('c')];

export function configured(isPersistent = false): StoreApi<PlayerStore> {
	return withResolver(
		({ itemId }) =>
			Promise.resolve({ status: 'ok', url: `https://api.test/tracks/${itemId}/stream` }),
		isPersistent,
	);
}

export function hidePage(): void {
	const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

	document.dispatchEvent(new Event('visibilitychange'));
	visibility.mockRestore();
}

export function pendingResolver() {
	const pending = new Map<string, (resolution: StreamResolution) => void>();
	const store = withResolver(
		({ itemId }) =>
			new Promise<StreamResolution>((resolve) => {
				pending.set(itemId, resolve);
			}),
	);

	return {
		answer: (itemId: string) => {
			pending.get(itemId)?.({ status: 'ok', url: `https://api.test/${itemId}` });
		},
		store,
	};
}

export function persisted(): StoreApi<PlayerStore> {
	return configured(true);
}

export function storeQueue(
	queue: ReadonlyArray<QueueItem>,
	order: Partial<StoredOrderRecord>,
): void {
	localStorage.setItem(
		queueStorageKey,
		JSON.stringify({ ...order, itemIds: queue.map((item) => item.itemId) }),
	);
	localStorage.setItem(
		queueItemsStorageKey,
		JSON.stringify(Object.fromEntries(queue.map((item) => [item.itemId, item]))),
	);
}

export function withResolver(
	stream: PlayerUrls['stream'],
	isPersistent = false,
): StoreApi<PlayerStore> {
	const store = createWritablePlayerStore({
		createEngine: fake.createEngine,
		storage: isPersistent ? undefined : createMemoryStorage(),
	});

	store.getState().configure({
		urls: {
			stream,
		},
	});

	return store;
}
