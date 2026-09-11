import type { PlayerStore } from '#store/player-types.ts';
import type { QueuedItem } from '#types.ts';

export function displayedItem(state: PlayerStore): QueuedItem | undefined {
	if (state.currentIndex !== undefined) return state.queue[state.currentIndex];

	const first = state.playOrder[0];

	return first === undefined ? undefined : state.queue[first];
}

export function isLoaded(state: PlayerStore): boolean {
	return state.currentIndex !== undefined;
}
