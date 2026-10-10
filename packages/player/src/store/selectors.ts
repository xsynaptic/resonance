import type { PlayerState, PlayerStore } from '#store/player-types.ts';
import type { QueueCuePoint, QueuedItem, QueueItemDetail } from '#types.ts';

import { cueIndexAt } from '#queue/cue-points.ts';
import { nextInOrder, previousInOrder } from '#queue/queue.ts';

// Past this many seconds into a track, previous restarts it instead of stepping back
export const restartThresholdSeconds = 3;

export function audibleVolume(state: Pick<PlayerState, 'isMuted' | 'volume'>): number {
	return state.isMuted ? 0 : state.volume;
}

export function canStepBack(state: PlayerStore): boolean {
	if (state.currentIndex === undefined) return false;

	return (
		state.currentTimeSeconds > restartThresholdSeconds ||
		previousInOrder(state.playOrder, state.currentIndex) !== undefined
	);
}

export function canStepForward(state: PlayerStore): boolean {
	if (state.currentIndex === undefined) return false;

	return nextInOrder(state.playOrder, state.currentIndex) !== undefined;
}

export function currentCue(state: PlayerStore): QueueCuePoint | undefined {
	const cuePoints = loadedDetail(state)?.cuePoints;
	if (!cuePoints) return undefined;

	return cuePoints[cueIndexAt(cuePoints, state.currentTimeSeconds)];
}

export function displayedDetail(state: PlayerStore): QueueItemDetail | undefined {
	const item = displayedItem(state);

	return item && state.details.get(item.itemId);
}

export function displayedItem(state: PlayerStore): QueuedItem | undefined {
	if (state.currentIndex !== undefined) return loadedItem(state);

	const first = state.playOrder[0];

	return first === undefined ? undefined : state.queue[first];
}

export function isAwaitingPlayback(state: PlayerStore): boolean {
	return !state.isPaused && state.status === 'loading';
}

export function isDetailPending(state: PlayerStore): boolean {
	const item = displayedItem(state);

	return item !== undefined && state.urls?.detail !== undefined && !state.details.has(item.itemId);
}

export function isLoaded(state: PlayerStore): boolean {
	return state.currentIndex !== undefined;
}

export function loadedDetail(state: PlayerStore): QueueItemDetail | undefined {
	const item = loadedItem(state);

	return item && state.details.get(item.itemId);
}

export function loadedItem(
	state: Pick<PlayerStore, 'currentIndex' | 'queue'>,
): QueuedItem | undefined {
	return state.currentIndex === undefined ? undefined : state.queue[state.currentIndex];
}
