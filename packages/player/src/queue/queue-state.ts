import type { QueuedItem, QueueItem } from '#types.ts';

import { identityOrder, isSectioned, shuffledOrder } from '#queue/queue.ts';
import { movedArray, movedIndex } from '#queue/reorder.ts';

export type NextQueueId = () => string;

export interface QueueState {
	currentIndex: number | undefined;
	isShuffling: boolean;
	playOrder: Array<number>;
	queue: Array<QueuedItem>;
}

export function appendedQueue(
	state: QueueState,
	items: ReadonlyArray<QueueItem>,
	nextId: NextQueueId,
	trackId?: string,
): undefined | { loadIndex: number; state: QueueState } {
	if (items.length === 0) return undefined;

	if (state.queue.length === 0) {
		const startIndex = trackId === undefined ? 0 : indexOfTrack(items, trackId);
		if (startIndex === undefined) return undefined;

		const queue = stamped(items, nextId);

		return {
			loadIndex: startIndex,
			state: ordered(queue, state.currentIndex, canShuffle(state, queue), startIndex),
		};
	}

	if (trackId === undefined) return appended(state, items, nextId);

	// Already queued is a jump, not a second copy
	const queued = indexOfTrack(state.queue, trackId);
	if (queued !== undefined) return { loadIndex: queued, state };

	const found = items.find((item) => item.trackId === trackId);
	if (!found) return undefined;

	return appended(state, [found], nextId);
}

export function createQueueIds(): NextQueueId {
	let count = 0;

	return () => {
		count += 1;

		return `q${String(count)}`;
	};
}

export function loadedQueue(
	state: QueueState,
	items: ReadonlyArray<QueueItem>,
	nextId: NextQueueId,
): QueueState {
	const queue = stamped(items, nextId);

	return ordered(queue, undefined, canShuffle(state, queue), undefined);
}

// A shuffled play order moves with the item rather than reshuffling under the listener
export function movedItem(state: QueueState, from: number, to: number): QueueState {
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

export function removedAt(state: QueueState, index: number): QueueState {
	const queue = state.queue.filter((_, position) => position !== index);
	const currentIndex = remainingIndex(state.currentIndex, index);

	return ordered(queue, currentIndex, state.isShuffling, currentIndex);
}

export function replacedAfter(
	state: QueueState,
	index: number,
	items: ReadonlyArray<QueueItem>,
	nextId: NextQueueId,
): QueueState {
	const queue = [...state.queue.slice(0, index + 1), ...stamped(items, nextId)];

	return ordered(queue, state.currentIndex, canShuffle(state, queue), state.currentIndex);
}

export function shuffledQueue(state: QueueState, isShuffling: boolean): QueueState {
	return ordered(state.queue, state.currentIndex, isShuffling, state.currentIndex);
}

function appended(
	state: QueueState,
	items: ReadonlyArray<QueueItem>,
	nextId: NextQueueId,
): { loadIndex: number; state: QueueState } {
	const loadIndex = state.queue.length;
	const queue = [...state.queue, ...stamped(items, nextId)];

	return {
		loadIndex,
		state: ordered(queue, state.currentIndex, state.isShuffling, loadIndex),
	};
}

// A sectioned queue lands unshuffled whatever the listener left the toggle on
function canShuffle(state: QueueState, queue: ReadonlyArray<QueuedItem>): boolean {
	return state.isShuffling && !isSectioned(queue);
}

function indexOfTrack(items: ReadonlyArray<QueueItem>, trackId: string): number | undefined {
	const index = items.findIndex((item) => item.trackId === trackId);

	return index === -1 ? undefined : index;
}

// `orderAround` is the track a shuffled order puts first, which is not always the loaded one
function ordered(
	queue: Array<QueuedItem>,
	currentIndex: number | undefined,
	isShuffling: boolean,
	orderAround: number | undefined,
): QueueState {
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

function stamped(items: ReadonlyArray<QueueItem>, nextId: NextQueueId): Array<QueuedItem> {
	return items.map((item) => ({ ...item, queueId: nextId() }));
}
