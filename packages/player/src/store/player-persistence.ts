import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerTimeMode, QueuedItem, QueueItem } from '#types.ts';

import { queueStorageKey } from '#constants.ts';
import { isPanelZoom } from '#store/zoom-levels.ts';

const mutedStorageKey = 'player:v1:muted';
const panelOpenStorageKey = 'player:v1:panel-open';
const panelZoomStorageKey = 'player:v1:panel-zoom';
const timeModeStorageKey = 'player:v1:time-mode';
const volumeStorageKey = 'player:v1:volume';

const volumeWriteDelayMs = 250;

export interface PlayerPersistence {
	// Bound on connect rather than at module load, because the store is also imported where there is no window
	bindQueue: () => void;
	persistMuted: (isMuted: boolean) => void;
	persistPanelOpen: (isOpen: boolean) => void;
	persistPanelZoom: (pxPerSecond: number) => void;
	persistTimeMode: (timeMode: PlayerTimeMode) => void;
	persistVolume: (volume: number) => void;
	// Unclamped: the preference actions own the volume range, so a hand-edited entry is corrected in one place
	readPreferences: () => StoredPreferences;
	readQueue: () => StoredQueue | undefined;
}

interface StoredPreferences {
	isMuted: boolean | undefined;
	isPanelOpen: boolean | undefined;
	panelPxPerSecond: number | undefined;
	timeMode: PlayerTimeMode | undefined;
	volume: number | undefined;
}

interface StoredQueue {
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	isShuffling: boolean;
	playOrder: Array<number> | undefined;
	queue: Array<QueueItem>;
}

export const inertPersistence: PlayerPersistence = {
	bindQueue: touchNothing,
	persistMuted: touchNothing,
	persistPanelOpen: touchNothing,
	persistPanelZoom: touchNothing,
	persistTimeMode: touchNothing,
	persistVolume: touchNothing,
	readPreferences: () => ({
		isMuted: undefined,
		isPanelOpen: undefined,
		panelPxPerSecond: undefined,
		timeMode: undefined,
		volume: undefined,
	}),
	readQueue: touchNothing,
};

// Per store rather than per module, so a second store never inherits a pending write
export function createPlayerPersistence(api: StoreApi<PlayerStore>): PlayerPersistence {
	let isFlushBound = false;
	let volumeWriteTimer: ReturnType<typeof setTimeout> | undefined;
	let volumeToWrite: number | undefined;

	let isQueueBound = false;
	let persistedQueue: Array<QueuedItem> = [];
	let persistedIndex: number | undefined;
	let persistedOrder: Array<number> = [];

	// A tab leaving with a queue it never touched would overwrite whatever another tab saved since
	let hasUnsavedPosition = false;

	function flushVolume(): void {
		if (volumeWriteTimer !== undefined) clearTimeout(volumeWriteTimer);

		volumeWriteTimer = undefined;

		if (volumeToWrite === undefined) return;

		writeStored(volumeStorageKey, String(volumeToWrite));
		volumeToWrite = undefined;
	}

	// An empty store writes nothing, so a tab unloading idle never deletes a queue another tab saved
	function writeQueue(): void {
		const { currentIndex, currentTimeSeconds, isShuffling, playOrder, queue } = api.getState();

		hasUnsavedPosition = false;
		if (queue.length === 0) return;

		writeStored(
			queueStorageKey,
			JSON.stringify({
				currentIndex,
				currentTimeSeconds,
				isShuffling,
				playOrder,
				queue,
			} satisfies StoredQueue),
		);
	}

	function flushPosition(): void {
		if (hasUnsavedPosition) writeQueue();
	}

	return {
		bindQueue() {
			if (isQueueBound) return;

			isQueueBound = true;
			({
				currentIndex: persistedIndex,
				playOrder: persistedOrder,
				queue: persistedQueue,
			} = api.getState());

			// Queue changes write straight away; the position drifting between them goes out when the page is left
			api.subscribe((state, previous) => {
				const { currentIndex, playOrder, queue } = state;

				if (state.currentTimeSeconds !== previous.currentTimeSeconds) hasUnsavedPosition = true;

				if (
					queue === persistedQueue &&
					currentIndex === persistedIndex &&
					playOrder === persistedOrder
				) {
					return;
				}

				const hasEmptied = queue.length === 0 && persistedQueue.length > 0;

				persistedQueue = queue;
				persistedIndex = currentIndex;
				persistedOrder = playOrder;

				if (hasEmptied) removeStored(queueStorageKey);
				else writeQueue();
			});
			onPageLeft(flushPosition);
		},

		persistMuted(isMuted) {
			writeStored(mutedStorageKey, String(isMuted));
		},

		persistPanelOpen(isOpen) {
			writeStored(panelOpenStorageKey, String(isOpen));
		},

		persistPanelZoom(pxPerSecond) {
			writeStored(panelZoomStorageKey, String(pxPerSecond));
		},

		persistTimeMode(timeMode) {
			writeStored(timeModeStorageKey, timeMode);
		},

		persistVolume(volume) {
			volumeToWrite = volume;

			if (!isFlushBound) {
				isFlushBound = true;
				// The tab can close inside the delay, so a pending write goes out on the way
				onPageLeft(flushVolume);
			}

			if (volumeWriteTimer !== undefined) return;

			volumeWriteTimer = setTimeout(flushVolume, volumeWriteDelayMs);
		},

		readPreferences: () => ({
			isMuted: readStoredMuted(),
			isPanelOpen: readStoredPanelOpen(),
			panelPxPerSecond: readStoredPanelZoom(),
			timeMode: readStoredTimeMode(),
			volume: readStoredVolume(),
		}),
		readQueue: readStoredQueue,
	};
}

function isPermutation(value: unknown, length: number): value is Array<number> {
	if (!Array.isArray(value) || value.length !== length) return false;

	const indices = new Set(value);

	return (
		indices.size === length &&
		[...indices].every((index) => Number.isSafeInteger(index) && index >= 0 && index < length)
	);
}

function isStoredItem(value: unknown): value is QueueItem {
	if (typeof value !== 'object' || value === null) return false;

	return ['artistLine', 'itemId', 'releaseTitle', 'title'].every(
		(key) => typeof Reflect.get(value, key) === 'string',
	);
}

// Mobile browsers kill a backgrounded tab without `pagehide`, so going hidden flushes too
function onPageLeft(flush: () => void): void {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
	window.addEventListener('pagehide', flush);
}

// Reaching for `localStorage` throws where the getter does: Safari with cookies blocked, a sandboxed iframe
function readStored(key: string): string | undefined {
	try {
		return localStorage.getItem(key) ?? undefined;
	} catch {
		return undefined;
	}
}

function readStoredMuted(): boolean | undefined {
	const stored = readStored(mutedStorageKey);
	if (stored === undefined) return undefined;

	return stored === 'true';
}

function readStoredPanelOpen(): boolean | undefined {
	const stored = readStored(panelOpenStorageKey);
	if (stored === undefined) return undefined;

	return stored === 'true';
}

// Validated against the ladder, so a hand-edited or retired step cannot land as the panel's scale
function readStoredPanelZoom(): number | undefined {
	const stored = readStored(panelZoomStorageKey);
	if (stored === undefined) return undefined;

	return isPanelZoom(Number(stored)) ? Number(stored) : undefined;
}

// Only this store writes the entry, so the guard covers a stale or hand-edited one rather than a foreign schema
function readStoredQueue(): StoredQueue | undefined {
	const stored = readStored(queueStorageKey);
	if (stored === undefined) return undefined;

	try {
		const parsed = JSON.parse(stored) as Partial<Record<keyof StoredQueue, unknown>>;
		if (!Array.isArray(parsed.queue)) return undefined;

		const queue = parsed.queue.filter((item) => isStoredItem(item));
		if (queue.length === 0) return undefined;

		const currentIndex = storedQueueIndex(parsed.queue, parsed.currentIndex, queue);
		const isShuffling = parsed.isShuffling === true;

		return {
			currentIndex,
			currentTimeSeconds:
				currentIndex === undefined ? 0 : storedTimeSeconds(parsed.currentTimeSeconds),
			isShuffling,
			playOrder:
				isShuffling && isPermutation(parsed.playOrder, queue.length) ? parsed.playOrder : undefined,
			queue,
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

function storedQueueIndex(
	stored: ReadonlyArray<unknown>,
	currentIndex: unknown,
	queue: ReadonlyArray<QueueItem>,
): number | undefined {
	if (typeof currentIndex !== 'number' || !Number.isSafeInteger(currentIndex)) return undefined;

	const item = stored[currentIndex];

	return isStoredItem(item) ? queue.indexOf(item) : undefined;
}

function storedTimeSeconds(currentTimeSeconds: unknown): number {
	if (typeof currentTimeSeconds !== 'number' || !Number.isFinite(currentTimeSeconds)) return 0;

	return Math.max(0, currentTimeSeconds);
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
