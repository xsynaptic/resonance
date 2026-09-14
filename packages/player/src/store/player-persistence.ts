import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerTimeMode, QueuedItem } from '#types.ts';

const queueStorageKey = 'player:v1:queue';
const timeModeStorageKey = 'player:v1:time-mode';
const volumeStorageKey = 'player:v1:volume';

const volumeWriteDelayMs = 250;

export interface PlayerPersistence {
	// Bound from a mount effect rather than at module load, because the store is also imported where there is no window
	bindQueue: () => void;
	persistTimeMode: (timeMode: PlayerTimeMode) => void;
	persistVolume: (volume: number) => void;
	// Unclamped: the controller owns the volume range, so a hand-edited entry is corrected in one place
	readPreferences: () => { timeMode: PlayerTimeMode | undefined; volume: number | undefined };
	readQueue: () => StoredQueue | undefined;
}

// What a reload puts back: the items, which one was loaded, and how far into it
interface StoredQueue {
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	isShuffling: boolean;
	queue: Array<QueuedItem>;
}

export const inertPersistence: PlayerPersistence = {
	bindQueue: touchNothing,
	persistTimeMode: touchNothing,
	persistVolume: touchNothing,
	readPreferences: () => ({ timeMode: undefined, volume: undefined }),
	readQueue: touchNothing,
};

// Per store rather than per module, so a second store never inherits a pending write
export function createPlayerPersistence(api: StoreApi<PlayerStore>): PlayerPersistence {
	let isFlushBound = false;
	let volumeWriteTimer: ReturnType<typeof setTimeout> | undefined;
	let volumeToWrite: number | undefined;

	let isQueueBound = false;
	let persistedQueue: Array<QueuedItem> | undefined;
	let persistedIndex: number | undefined;

	function flushVolume(): void {
		if (volumeWriteTimer !== undefined) clearTimeout(volumeWriteTimer);

		volumeWriteTimer = undefined;

		if (volumeToWrite === undefined) return;

		writeStored(volumeStorageKey, String(volumeToWrite));
		volumeToWrite = undefined;
	}

	function writeQueue(): void {
		const { currentIndex, currentTimeSeconds, isShuffling, queue } = api.getState();

		if (queue.length === 0) {
			removeStored(queueStorageKey);
			return;
		}

		writeStored(
			queueStorageKey,
			JSON.stringify({
				currentIndex,
				currentTimeSeconds,
				isShuffling,
				queue,
			} satisfies StoredQueue),
		);
	}

	return {
		bindQueue() {
			if (isQueueBound) return;

			isQueueBound = true;

			// Queue changes write straight away; the position drifting between them goes out on `pagehide`
			api.subscribe(() => {
				const { currentIndex, queue } = api.getState();
				if (queue === persistedQueue && currentIndex === persistedIndex) return;

				persistedQueue = queue;
				persistedIndex = currentIndex;
				writeQueue();
			});
			window.addEventListener('pagehide', writeQueue);
		},

		persistTimeMode(timeMode) {
			writeStored(timeModeStorageKey, timeMode);
		},

		persistVolume(volume) {
			volumeToWrite = volume;

			if (!isFlushBound) {
				isFlushBound = true;
				// The tab can close inside the delay, so a pending write goes out on the way
				window.addEventListener('pagehide', flushVolume);
			}

			if (volumeWriteTimer !== undefined) return;

			volumeWriteTimer = setTimeout(flushVolume, volumeWriteDelayMs);
		},

		readPreferences: () => ({ timeMode: readStoredTimeMode(), volume: readStoredVolume() }),
		readQueue: readStoredQueue,
	};
}

// Reaching for `localStorage` throws where the getter does: Safari with cookies blocked, a sandboxed iframe
function readStored(key: string): string | undefined {
	try {
		return localStorage.getItem(key) ?? undefined;
	} catch {
		return undefined;
	}
}

// Only this store writes the entry, so the guard covers a stale or hand-edited one rather than a foreign schema
function readStoredQueue(): StoredQueue | undefined {
	const stored = readStored(queueStorageKey);
	if (stored === undefined) return undefined;

	try {
		const parsed = JSON.parse(stored) as StoredQueue;
		if (!Array.isArray(parsed.queue) || parsed.queue.length === 0) return undefined;

		const currentIndex = storedQueueIndex(parsed.currentIndex, parsed.queue.length);

		return {
			currentIndex,
			currentTimeSeconds:
				currentIndex === undefined ? 0 : storedTimeSeconds(parsed.currentTimeSeconds),
			isShuffling: parsed.isShuffling,
			queue: parsed.queue,
		};
	} catch {
		return undefined;
	}
}

function readStoredTimeMode(): PlayerTimeMode | undefined {
	const stored = readStored(timeModeStorageKey);

	return stored === 'elapsed' || stored === 'remaining' ? stored : undefined;
}

function readStoredVolume(): number | undefined {
	const stored = readStored(volumeStorageKey);
	if (stored === undefined) return undefined;

	const value = Number(stored);

	return Number.isFinite(value) ? value : undefined;
}

function removeStored(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		return;
	}
}

function storedQueueIndex(currentIndex: number | undefined, length: number): number | undefined {
	if (typeof currentIndex !== 'number' || currentIndex < 0 || currentIndex >= length) {
		return undefined;
	}

	return currentIndex;
}

function storedTimeSeconds(currentTimeSeconds: number): number {
	return Number.isFinite(currentTimeSeconds) ? Math.max(0, currentTimeSeconds) : 0;
}

function touchNothing(): undefined {
	// A secondary mount leaves the listener's storage alone
}

function writeStored(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		return;
	}
}
