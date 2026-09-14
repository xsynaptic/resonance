import type { PlayerStore } from '#store/player-types.ts';
import type { QueuedItem } from '#types.ts';

import { nextInOrder, previousInOrder } from '#queue/queue.ts';

// Past this many seconds into a track, previous restarts it instead of stepping back
export const restartThresholdSeconds = 3;

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

export function displayedItem(state: PlayerStore): QueuedItem | undefined {
	if (state.currentIndex !== undefined) return state.queue[state.currentIndex];

	const first = state.playOrder[0];

	return first === undefined ? undefined : state.queue[first];
}

// Loading while paused has nobody waiting on it
export function isAwaitingPlayback(state: PlayerStore): boolean {
	return state.isPlayIntended && state.status === 'loading';
}

export function isLoaded(state: PlayerStore): boolean {
	return state.currentIndex !== undefined;
}
