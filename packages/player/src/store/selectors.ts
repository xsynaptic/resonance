import type { PlayerState, PlayerStore } from '#store/player-types.ts';
import type { QueueCuePoint, QueuedItem } from '#types.ts';

import { nextInOrder, previousInOrder } from '#queue/queue.ts';
import { cueIndexAt } from '#waveform/cue-points.ts';

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
	const cuePoints = loadedItem(state)?.cuePoints;
	if (!cuePoints) return undefined;

	return cuePoints[cueIndexAt(cuePoints, state.currentTimeSeconds)];
}

export function displayedItem(state: PlayerStore): QueuedItem | undefined {
	if (state.currentIndex !== undefined) return loadedItem(state);

	const first = state.playOrder[0];

	return first === undefined ? undefined : state.queue[first];
}

export function isAwaitingPlayback(state: PlayerStore): boolean {
	return !state.isPaused && state.status === 'loading';
}

export function isLoaded(state: PlayerStore): boolean {
	return state.currentIndex !== undefined;
}

export function loadedItem(
	state: Pick<PlayerStore, 'currentIndex' | 'queue'>,
): QueuedItem | undefined {
	return state.currentIndex === undefined ? undefined : state.queue[state.currentIndex];
}

export function queuedIndex(state: Pick<PlayerStore, 'queue'>, itemId: string): number {
	return state.queue.findIndex((item) => item.itemId === itemId);
}
