import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerTimeMode, QueuedItem } from '#types.ts';

import { queueStorageKey } from '#constants.ts';
import { isPanelZoom } from '#store/zoom-levels.ts';

const mutedStorageKey = 'player:v1:muted';
const panelOpenStorageKey = 'player:v1:panel-open';
const panelZoomStorageKey = 'player:v1:panel-zoom';
const retiredQueueStorageKey = 'player:v1:queue';
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

// What a reload puts back: the items, which one was loaded, and how far into it
interface StoredQueue {
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	isShuffling: boolean;
	queue: Array<QueuedItem>;
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

	function flushVolume(): void {
		if (volumeWriteTimer !== undefined) clearTimeout(volumeWriteTimer);

		volumeWriteTimer = undefined;

		if (volumeToWrite === undefined) return;

		writeStored(volumeStorageKey, String(volumeToWrite));
		volumeToWrite = undefined;
	}

	// An empty store writes nothing, so a tab unloading idle never deletes a queue another tab saved
	function writeQueue(): void {
		const { currentIndex, currentTimeSeconds, isShuffling, queue } = api.getState();
		if (queue.length === 0) return;

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
			removeStored(retiredQueueStorageKey);
			({ currentIndex: persistedIndex, queue: persistedQueue } = api.getState());

			// Queue changes write straight away; the position drifting between them goes out on `pagehide`
			api.subscribe(() => {
				const { currentIndex, queue } = api.getState();
				if (queue === persistedQueue && currentIndex === persistedIndex) return;

				const hasEmptied = queue.length === 0 && persistedQueue.length > 0;

				persistedQueue = queue;
				persistedIndex = currentIndex;

				if (hasEmptied) removeStored(queueStorageKey);
				else writeQueue();
			});
			window.addEventListener('pagehide', writeQueue);
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
				window.addEventListener('pagehide', flushVolume);
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
		const parsed = JSON.parse(stored) as Partial<StoredQueue>;
		if (!Array.isArray(parsed.queue) || parsed.queue.length === 0) return undefined;

		const currentIndex = storedQueueIndex(parsed.currentIndex, parsed.queue.length);

		return {
			currentIndex,
			currentTimeSeconds:
				currentIndex === undefined ? 0 : storedTimeSeconds(parsed.currentTimeSeconds),
			isShuffling: parsed.isShuffling === true,
			queue: storedQueueItems(parsed.queue),
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

// A queue stored before the 2026-09-16 rename carries `trackId`; droppable once those queues have aged out
function storedQueueItems(queue: Array<QueuedItem>): Array<QueuedItem> {
	return queue.map((item) => {
		const { trackId, ...rest } = item as QueuedItem & { trackId?: string };
		if (trackId === undefined) return item;

		return { ...rest, itemId: trackId };
	});
}

function storedTimeSeconds(currentTimeSeconds: number | undefined): number {
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
