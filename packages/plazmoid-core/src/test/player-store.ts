import type { StoreApi } from 'zustand/vanilla';

import { vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerUrls, StreamResolution, Track } from '#types.ts';

import { queueStorageKey, queueTracksStorageKey } from '#constants.ts';
import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { createMemoryStorage } from '#lib/storage.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';

export interface StoredOrderRecord {
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	isShuffling: boolean;
	playOrder: Array<number>;
	trackIds: Array<string>;
}

// Replaced per test, so nothing a store did survives into the next one
export let fake = createMockEngine();

export function resetEngine(): void {
	fake = createMockEngine();
}

export function makeTrack(id: string): Track {
	return {
		artistLine: 'Nebula Drift',
		durationMs: 180_000,
		releaseHref: '/releases/cosmic-drift',
		releaseTitle: 'Cosmic Drift',
		title: `Track ${id}`,
		trackId: id,
	};
}

export const release = [makeTrack('a'), makeTrack('b'), makeTrack('c')];

export function configured(isPersistent = false): StoreApi<PlayerStore> {
	return withResolver(
		({ trackId }) =>
			Promise.resolve({ status: 'ok', url: `https://api.test/tracks/${trackId}/stream` }),
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
		({ trackId }) =>
			new Promise<StreamResolution>((resolve) => {
				pending.set(trackId, resolve);
			}),
	);

	return {
		answer: (trackId: string) => {
			pending.get(trackId)?.({ status: 'ok', url: `https://api.test/${trackId}` });
		},
		store,
	};
}

export function persisted(): StoreApi<PlayerStore> {
	return configured(true);
}

export function storeQueue(queue: ReadonlyArray<Track>, order: Partial<StoredOrderRecord>): void {
	localStorage.setItem(
		queueStorageKey,
		JSON.stringify({ ...order, trackIds: queue.map((track) => track.trackId) }),
	);
	localStorage.setItem(
		queueTracksStorageKey,
		JSON.stringify(Object.fromEntries(queue.map((track) => [track.trackId, track]))),
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
