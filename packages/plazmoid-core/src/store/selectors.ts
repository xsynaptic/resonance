import type { PlayerState, PlayerStore } from '#store/player-types.ts';
import type { CuePoint, QueuedTrack, TrackDetail } from '#types.ts';

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

export function currentCue(state: PlayerStore): CuePoint | undefined {
	const cuePoints = loadedDetail(state)?.cuePoints;
	if (!cuePoints) return undefined;

	return cuePoints[cueIndexAt(cuePoints, state.currentTimeSeconds)];
}

export function displayedDetail(state: PlayerStore): TrackDetail | undefined {
	const track = displayedTrack(state);

	return track && state.details.get(track.trackId);
}

export function displayedTrack(state: PlayerStore): QueuedTrack | undefined {
	if (state.currentIndex !== undefined) return loadedTrack(state);

	const first = state.playOrder[0];

	return first === undefined ? undefined : state.queue[first];
}

export function isAwaitingPlayback(state: PlayerStore): boolean {
	return !state.isPaused && state.status === 'loading';
}

export function isDetailPending(state: PlayerStore): boolean {
	const track = displayedTrack(state);

	return (
		track !== undefined && state.urls?.detail !== undefined && !state.details.has(track.trackId)
	);
}

export function isLoaded(state: PlayerStore): boolean {
	return state.currentIndex !== undefined;
}

export function loadedDetail(state: PlayerStore): TrackDetail | undefined {
	const track = loadedTrack(state);

	return track && state.details.get(track.trackId);
}

export function loadedTrack(
	state: Pick<PlayerStore, 'currentIndex' | 'queue'>,
): QueuedTrack | undefined {
	return state.currentIndex === undefined ? undefined : state.queue[state.currentIndex];
}
