import type { QueuedTrack, Track } from '#types.ts';

import { isRecord } from '#lib/is-record.ts';
import { identityOrder, shuffledOrder } from '#queue/queue.ts';
import { movedArray, movedIndex } from '#queue/reorder.ts';

export type NextQueueId = () => string;

export interface QueueState {
	currentIndex: number | undefined;
	isShuffling: boolean;
	playOrder: Array<number>;
	queue: Array<QueuedTrack>;
}

interface OrderedQueue {
	currentIndex: number | undefined;
	isShuffling: boolean;
	// The track a shuffled order puts first, which is not always the loaded one
	orderAround: number | undefined;
	queue: Array<QueuedTrack>;
}

// Tracks arrive stamped, so identity is assigned once at the edge rather than by every transition
export function appendedQueue(
	state: QueueState,
	tracks: ReadonlyArray<QueuedTrack>,
	trackId?: string,
): undefined | { loadIndex: number; state: QueueState } {
	if (tracks.length === 0) return undefined;

	if (state.queue.length === 0) {
		const startIndex = trackId === undefined ? 0 : indexOfTrack(tracks, trackId);
		if (startIndex === undefined) return undefined;

		const queue = [...tracks];

		return {
			loadIndex: startIndex,
			state: ordered({
				currentIndex: state.currentIndex,
				isShuffling: state.isShuffling,
				orderAround: startIndex,
				queue,
			}),
		};
	}

	if (trackId === undefined) return appended(state, tracks);

	// Already queued is a jump, not a second copy
	const queued = indexOfTrack(state.queue, trackId);
	if (queued !== undefined) return { loadIndex: queued, state };

	const found = tracks.find((track) => track.trackId === trackId);
	if (!found) return undefined;

	return appended(state, [found]);
}

export function createQueueIds(): NextQueueId {
	let count = 0;

	return () => {
		count += 1;

		return `q${String(count)}`;
	};
}

export function loadedQueue(state: QueueState, tracks: ReadonlyArray<QueuedTrack>): QueueState {
	const queue = [...tracks];

	return ordered({
		currentIndex: undefined,
		isShuffling: state.isShuffling,
		orderAround: undefined,
		queue,
	});
}

// A shuffled play order moves with the track rather than reshuffling under the listener
export function movedTrack(state: QueueState, from: number, to: number): QueueState {
	return {
		currentIndex:
			state.currentIndex === undefined ? undefined : movedIndex(state.currentIndex, from, to),
		isShuffling: state.isShuffling,
		playOrder: state.isShuffling
			? state.playOrder.map((index) => movedIndex(index, from, to))
			: identityOrder(state.queue.length),
		queue: movedArray(state.queue, from, to),
	};
}

// `undefined` when nothing differs, so an unchanged queue is not written back to storage
export function refreshedQueue(
	queue: ReadonlyArray<QueuedTrack>,
	tracks: ReadonlyArray<Track>,
): Array<QueuedTrack> | undefined {
	const refreshed = queue.map((queued) => {
		const fresh = tracks.find((track) => track.trackId === queued.trackId);
		if (!fresh) return queued;

		const candidate = { ...fresh, queueId: queued.queueId };

		return isSameJson(candidate, queued) ? queued : candidate;
	});

	return refreshed.some((track, index) => track !== queue[index]) ? refreshed : undefined;
}

export function removedAt(state: QueueState, index: number): QueueState {
	const queue = state.queue.filter((_, position) => position !== index);

	return {
		currentIndex: remainingIndex(state.currentIndex, index),
		isShuffling: state.isShuffling,
		playOrder: state.isShuffling
			? remainingOrder(state.playOrder, index)
			: identityOrder(queue.length),
		queue,
	};
}

export function shuffledQueue(state: QueueState, isShuffling: boolean): QueueState {
	return ordered({
		currentIndex: state.currentIndex,
		isShuffling,
		orderAround: state.currentIndex,
		queue: state.queue,
	});
}

export function stampQueue(tracks: ReadonlyArray<Track>, nextId: NextQueueId): Array<QueuedTrack> {
	return tracks.map((track) => ({ ...track, queueId: nextId() }));
}

function appended(
	state: QueueState,
	tracks: ReadonlyArray<QueuedTrack>,
): { loadIndex: number; state: QueueState } {
	const loadIndex = state.queue.length;
	const added = tracks.map((_, offset) => loadIndex + offset);

	return {
		loadIndex,
		state: {
			currentIndex: state.currentIndex,
			isShuffling: state.isShuffling,
			playOrder: [...state.playOrder, ...added],
			queue: [...state.queue, ...tracks],
		},
	};
}

function definedKeys(record: Record<string, unknown>): Array<string> {
	return Object.keys(record).filter((key) => record[key] !== undefined);
}

function indexOfTrack(tracks: ReadonlyArray<Track>, trackId: string): number | undefined {
	const index = tracks.findIndex((track) => track.trackId === trackId);

	return index === -1 ? undefined : index;
}

export function isSameJson(left: unknown, right: unknown): boolean {
	if (left === right) return true;

	if (Array.isArray(left) && Array.isArray(right)) {
		return (
			left.length === right.length && left.every((value, index) => isSameJson(value, right[index]))
		);
	}

	if (!isRecord(left) || !isRecord(right)) return false;

	const leftKeys = definedKeys(left);

	return (
		leftKeys.length === definedKeys(right).length &&
		leftKeys.every((key) => isSameJson(left[key], right[key]))
	);
}

function ordered({ currentIndex, isShuffling, orderAround, queue }: OrderedQueue): QueueState {
	return {
		currentIndex,
		isShuffling,
		playOrder: isShuffling ? shuffledOrder(queue.length, orderAround) : identityOrder(queue.length),
		queue,
	};
}

function remainingIndex(currentIndex: number | undefined, removed: number): number | undefined {
	if (currentIndex === undefined || currentIndex === removed) return undefined;

	return removed < currentIndex ? currentIndex - 1 : currentIndex;
}

function remainingOrder(playOrder: ReadonlyArray<number>, removed: number): Array<number> {
	return playOrder
		.filter((position) => position !== removed)
		.map((position) => (position > removed ? position - 1 : position));
}
