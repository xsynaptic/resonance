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

interface OrderedQueue {
	currentIndex: number | undefined;
	isShuffling: boolean;
	// The track a shuffled order puts first, which is not always the loaded one
	orderAround: number | undefined;
	queue: Array<QueuedItem>;
}

// Items arrive stamped, so identity is assigned once at the edge rather than by every transition
export function appendedQueue(
	state: QueueState,
	items: ReadonlyArray<QueuedItem>,
	trackId?: string,
): undefined | { loadIndex: number; state: QueueState } {
	if (items.length === 0) return undefined;

	if (state.queue.length === 0) {
		const startIndex = trackId === undefined ? 0 : indexOfTrack(items, trackId);
		if (startIndex === undefined) return undefined;

		const queue = [...items];

		return {
			loadIndex: startIndex,
			state: ordered({
				currentIndex: state.currentIndex,
				isShuffling: canShuffle(state, queue),
				orderAround: startIndex,
				queue,
			}),
		};
	}

	if (trackId === undefined) return appended(state, items);

	// Already queued is a jump, not a second copy
	const queued = indexOfTrack(state.queue, trackId);
	if (queued !== undefined) return { loadIndex: queued, state };

	const found = items.find((item) => item.trackId === trackId);
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

export function loadedQueue(state: QueueState, items: ReadonlyArray<QueuedItem>): QueueState {
	const queue = [...items];

	return ordered({
		currentIndex: undefined,
		isShuffling: canShuffle(state, queue),
		orderAround: undefined,
		queue,
	});
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

// `undefined` when nothing differs, so an unchanged queue is not written back to storage
export function refreshedQueue(
	queue: ReadonlyArray<QueuedItem>,
	items: ReadonlyArray<QueueItem>,
): Array<QueuedItem> | undefined {
	const refreshed = queue.map((queued) => {
		const fresh = items.find((item) => item.trackId === queued.trackId);
		if (!fresh) return queued;

		const candidate = { ...fresh, queueId: queued.queueId };

		// Both sides are plain JSON in the same key order, so the serialized forms compare exactly
		return JSON.stringify(candidate) === JSON.stringify(queued) ? queued : candidate;
	});

	return refreshed.some((item, index) => item !== queue[index]) ? refreshed : undefined;
}

export function removedAt(state: QueueState, index: number): QueueState {
	const queue = state.queue.filter((_, position) => position !== index);
	const currentIndex = remainingIndex(state.currentIndex, index);

	return ordered({
		currentIndex,
		isShuffling: state.isShuffling,
		orderAround: currentIndex,
		queue,
	});
}

export function replacedAfter(
	state: QueueState,
	index: number,
	items: ReadonlyArray<QueuedItem>,
): QueueState {
	const queue = [...state.queue.slice(0, index + 1), ...items];

	return ordered({
		currentIndex: state.currentIndex,
		isShuffling: canShuffle(state, queue),
		orderAround: state.currentIndex,
		queue,
	});
}

export function shuffledQueue(state: QueueState, isShuffling: boolean): QueueState {
	return ordered({
		currentIndex: state.currentIndex,
		isShuffling,
		orderAround: state.currentIndex,
		queue: state.queue,
	});
}

export function stampQueue(
	items: ReadonlyArray<QueueItem>,
	nextId: NextQueueId,
): Array<QueuedItem> {
	return items.map((item) => ({ ...item, queueId: nextId() }));
}

function appended(
	state: QueueState,
	items: ReadonlyArray<QueuedItem>,
): { loadIndex: number; state: QueueState } {
	const loadIndex = state.queue.length;
	const queue = [...state.queue, ...items];

	return {
		loadIndex,
		state: ordered({
			currentIndex: state.currentIndex,
			isShuffling: state.isShuffling,
			orderAround: loadIndex,
			queue,
		}),
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
