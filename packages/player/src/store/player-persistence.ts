import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStorage } from '#lib/storage.ts';
import type { PlayerState, PlayerStore } from '#store/player-types.ts';
import type { PlayerTimeMode, QueuedTrack, Track, TrackDetail } from '#types.ts';

import {
	mutedStorageKey,
	panelOpenStorageKey,
	panelZoomStorageKey,
	queueDetailStorageKey,
	queueStorageKey,
	queueTracksStorageKey,
	timeModeStorageKey,
	volumeStorageKey,
} from '#constants.ts';
import { isRecord } from '#lib/is-record.ts';
import { readStored, removeStored, writeStored } from '#lib/storage.ts';
import { displayedDetail, displayedTrack } from '#store/selectors.ts';
import { toStoredDetail, toStoredTrack } from '#store/stored-shapes.ts';
import { isPanelZoom } from '#store/zoom-levels.ts';

const volumeWriteDelayMs = 250;

export interface PlayerPersistence {
	// Bound after the stored state lands, so restoring it writes nothing back
	bind: () => void;
	readDetails: () => Map<string, TrackDetail>;
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
	queue: Array<Track>;
}

interface StoredOrder extends Pick<
	PlayerState,
	'currentIndex' | 'currentTimeSeconds' | 'isShuffling' | 'playOrder'
> {
	trackIds: Array<string>;
}

// Per store rather than per module, so a second store never inherits a pending write
export function createPlayerPersistence(
	api: StoreApi<PlayerStore>,
	storage: PlayerStorage | undefined,
): PlayerPersistence {
	const volume = createVolumeWriter(storage);
	let isBound = false;

	let areTracksStored = false;
	let persistedDetail: TrackDetail | undefined;
	let persistedDetailId: string | undefined;
	let persistedIndex: number | undefined;
	let persistedTracks: ReadonlySet<QueuedTrack> = new Set();
	let persistedOrder: Array<number> = [];
	let persistedQueue: Array<QueuedTrack> = [];

	// A tab leaving with a queue it never touched would overwrite whatever another tab saved since
	let hasUnsavedPosition = false;

	// An empty store writes nothing, so a tab unloading idle never deletes a queue another tab saved
	function writeQueue(): void {
		const { currentIndex, currentTimeSeconds, isShuffling, playOrder, queue } = api.getState();

		hasUnsavedPosition = false;
		if (queue.length === 0) return;

		if (
			queue.length !== persistedTracks.size ||
			queue.some((track) => !persistedTracks.has(track))
		) {
			persistedTracks = new Set(queue);
			writeStored(
				storage,
				queueTracksStorageKey,
				JSON.stringify(Object.fromEntries(queue.map((track) => [track.trackId, track]))),
			);
		}

		writeStored(
			storage,
			queueStorageKey,
			JSON.stringify({
				currentIndex,
				currentTimeSeconds,
				isShuffling,
				playOrder,
				trackIds: queue.map((track) => track.trackId),
			} satisfies StoredOrder),
		);
	}

	function flush(): void {
		volume.flush();
		if (hasUnsavedPosition) writeQueue();
	}

	function persistDetail(state: PlayerStore): void {
		const trackId = displayedTrack(state)?.trackId;
		const detail = displayedDetail(state);

		if (trackId === persistedDetailId && detail === persistedDetail) return;

		persistedDetailId = trackId;
		persistedDetail = detail;
		writeDetail(storage, trackId, detail);
	}

	// Queue changes write straight away; the position drifting between them goes out when the page is left
	function persistQueue({ currentIndex, playOrder, queue }: PlayerStore): void {
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

		if (!hasEmptied) {
			writeQueue();
			return;
		}

		persistedTracks = new Set();
		removeStored(storage, queueStorageKey);
		removeStored(storage, queueTracksStorageKey);
	}

	return {
		bind() {
			if (isBound) return;

			isBound = true;

			const state = api.getState();

			({ currentIndex: persistedIndex, playOrder: persistedOrder, queue: persistedQueue } = state);
			persistedDetail = displayedDetail(state);
			persistedDetailId = displayedTrack(state)?.trackId;
			if (areTracksStored) persistedTracks = new Set(state.queue);

			api.subscribe((next, previous) => {
				if (next.currentTimeSeconds !== previous.currentTimeSeconds) hasUnsavedPosition = true;

				writePreferences(storage, next, previous);
				if (next.volume !== previous.volume) volume.write(next.volume);
				persistDetail(next);
				persistQueue(next);
			});
			// The tab can close inside the volume's delay, so a pending write goes out on the way
			onPageLeft(flush);
		},

		readDetails: () => readStoredDetails(storage),
		readPreferences: () => readStoredPreferences(storage),
		readQueue() {
			const stored = readStoredQueue(storage);

			areTracksStored = stored !== undefined;

			return stored;
		},
	};
}

function createVolumeWriter(storage: PlayerStorage | undefined) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: number | undefined;

	function flush(): void {
		if (timer !== undefined) clearTimeout(timer);

		timer = undefined;

		if (pending === undefined) return;

		writeStored(storage, volumeStorageKey, String(pending));
		pending = undefined;
	}

	return {
		flush,
		write(volume: number): void {
			pending = volume;
			timer = timer ?? setTimeout(flush, volumeWriteDelayMs);
		},
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

// Mobile browsers kill a backgrounded tab without `pagehide`, so going hidden flushes too
function onPageLeft(flush: () => void): void {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
	window.addEventListener('pagehide', flush);
}

function readStoredDetails(storage: PlayerStorage | undefined): Map<string, TrackDetail> {
	const stored = readStored(storage, queueDetailStorageKey);
	if (stored === undefined) return new Map();

	try {
		const parsed: unknown = JSON.parse(stored);
		const details = new Map<string, TrackDetail>();

		if (!isRecord(parsed)) return details;

		for (const [trackId, value] of Object.entries(parsed)) {
			const detail = toStoredDetail(value);

			if (detail) details.set(trackId, detail);
		}

		return details;
	} catch {
		return new Map();
	}
}

function readStoredFlag(storage: PlayerStorage | undefined, key: string): boolean | undefined {
	const stored = readStored(storage, key);
	if (stored === undefined) return undefined;

	return stored === 'true';
}

function readStoredTracks(storage: PlayerStorage | undefined): Map<string, unknown> {
	const stored = readStored(storage, queueTracksStorageKey);
	if (stored === undefined) return new Map();

	const parsed: unknown = JSON.parse(stored);

	return new Map(isRecord(parsed) ? Object.entries(parsed) : []);
}

function readStoredPanelZoom(storage: PlayerStorage | undefined): number | undefined {
	const stored = readStored(storage, panelZoomStorageKey);
	if (stored === undefined) return undefined;

	return isPanelZoom(Number(stored)) ? Number(stored) : undefined;
}

function readStoredPreferences(storage: PlayerStorage | undefined): StoredPreferences {
	return {
		isMuted: readStoredFlag(storage, mutedStorageKey),
		isPanelOpen: readStoredFlag(storage, panelOpenStorageKey),
		panelPxPerSecond: readStoredPanelZoom(storage),
		timeMode: readStoredTimeMode(storage),
		volume: readStoredVolume(storage),
	};
}

// Only this store writes the entry, so the guard covers a stale or hand-edited one rather than a foreign schema
function readStoredQueue(storage: PlayerStorage | undefined): StoredQueue | undefined {
	const stored = readStored(storage, queueStorageKey);
	if (stored === undefined) return undefined;

	try {
		const parsed = JSON.parse(stored) as Partial<Record<keyof StoredOrder, unknown>>;
		const positions = storedPositions(storage, parsed.trackIds);

		const queue = positions.filter((track) => track !== undefined);
		if (queue.length === 0) return undefined;

		const currentIndex = storedQueueIndex(positions, parsed.currentIndex);
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

function readStoredTimeMode(storage: PlayerStorage | undefined): PlayerTimeMode | undefined {
	const stored = readStored(storage, timeModeStorageKey);

	return stored === 'elapsed' || stored === 'remaining' ? stored : undefined;
}

function readStoredVolume(storage: PlayerStorage | undefined): number | undefined {
	const stored = readStored(storage, volumeStorageKey);
	if (stored === undefined) return undefined;

	const value = Number(stored);

	return Number.isFinite(value) ? value : undefined;
}

function storedPositions(
	storage: PlayerStorage | undefined,
	trackIds: unknown,
): Array<Track | undefined> {
	if (!Array.isArray(trackIds)) return [];

	const tracks = readStoredTracks(storage);

	return trackIds.map((trackId: unknown) =>
		typeof trackId === 'string' ? toStoredTrack(tracks.get(trackId)) : undefined,
	);
}

function storedQueueIndex(
	positions: ReadonlyArray<Track | undefined>,
	currentIndex: unknown,
): number | undefined {
	if (typeof currentIndex !== 'number' || !Number.isSafeInteger(currentIndex)) return undefined;
	if (positions[currentIndex] === undefined) return undefined;

	return positions.slice(0, currentIndex).filter((track) => track !== undefined).length;
}

function storedTimeSeconds(currentTimeSeconds: unknown): number {
	if (typeof currentTimeSeconds !== 'number' || !Number.isFinite(currentTimeSeconds)) return 0;

	return Math.max(0, currentTimeSeconds);
}

function writeDetail(
	storage: PlayerStorage | undefined,
	trackId: string | undefined,
	detail: TrackDetail | undefined,
): void {
	if (trackId === undefined || detail === undefined || Object.keys(detail).length === 0) {
		removeStored(storage, queueDetailStorageKey);
		return;
	}

	writeStored(storage, queueDetailStorageKey, JSON.stringify({ [trackId]: detail }));
}

function writePreferences(
	storage: PlayerStorage | undefined,
	state: PlayerState,
	previous: PlayerState,
): void {
	if (state.isMuted !== previous.isMuted) {
		writeStored(storage, mutedStorageKey, String(state.isMuted));
	}

	if (state.isPanelOpen !== previous.isPanelOpen) {
		writeStored(storage, panelOpenStorageKey, String(state.isPanelOpen));
	}

	if (state.panelPxPerSecond !== previous.panelPxPerSecond) {
		writeStored(storage, panelZoomStorageKey, String(state.panelPxPerSecond));
	}

	if (state.timeMode !== previous.timeMode) {
		writeStored(storage, timeModeStorageKey, state.timeMode);
	}
}
