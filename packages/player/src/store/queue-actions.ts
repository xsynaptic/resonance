import type { StoreApi } from 'zustand/vanilla';

import type { QueueState } from '#queue/queue-state.ts';
import type { PlaybackController } from '#store/playback-controller.ts';
import type { PlayerPersistence } from '#store/player-persistence.ts';
import type { PlayerActions, PlayerStore } from '#store/player-types.ts';
import type { QueueItem } from '#types.ts';

import {
	appendedQueue,
	createQueueIds,
	loadedQueue,
	movedItem,
	removedAt,
	replacedAfter,
	shuffledQueue,
	stampQueue,
} from '#queue/queue-state.ts';
import { isSectioned } from '#queue/queue.ts';
import { canMove } from '#queue/reorder.ts';

type QueueActions = Pick<
	PlayerActions,
	| 'clearQueue'
	| 'hydrateQueue'
	| 'loadQueue'
	| 'moveItem'
	| 'playRelease'
	| 'playTrack'
	| 'queueTrack'
	| 'removeAt'
	| 'replaceAfter'
	| 'toggleShuffle'
>;

export function createQueueActions({
	api,
	persistence,
	playback,
}: {
	api: StoreApi<PlayerStore>;
	persistence: PlayerPersistence;
	playback: PlaybackController;
}): QueueActions {
	const { getState: get, setState: set } = api;

	const nextQueueId = createQueueIds();

	function queueState(): QueueState {
		const { currentIndex, isShuffling, playOrder, queue } = get();

		return { currentIndex, isShuffling, playOrder, queue };
	}

	function stamped(items: ReadonlyArray<QueueItem>) {
		return stampQueue(items, nextQueueId);
	}

	// A jump onto a track that is already loaded is a transport toggle, not a reload
	function enqueue(items: ReadonlyArray<QueueItem>, trackId?: string): void {
		const appended = appendedQueue(queueState(), stamped(items), trackId);
		if (!appended) return;

		if (appended.loadIndex === get().currentIndex) {
			get().togglePlay();
			return;
		}

		set(appended.state);
		playback.loadIndex(appended.loadIndex, true);
	}

	return {
		clearQueue: () => {
			playback.unload();
			set({
				currentIndex: undefined,
				currentTimeSeconds: 0,
				durationSeconds: undefined,
				playOrder: [],
				queue: [],
				status: 'idle',
			});
		},

		hydrateQueue: () => {
			const stored = persistence.readQueue();

			// A page that queued something before this ran keeps what it queued
			if (stored && get().queue.length === 0) {
				const restored = loadedQueue(queueState(), stamped(stored.queue));
				const item =
					stored.currentIndex === undefined ? undefined : stored.queue[stored.currentIndex];

				set({
					...shuffledQueue({ ...restored, currentIndex: stored.currentIndex }, stored.isShuffling),
					currentTimeSeconds: stored.currentTimeSeconds,
					durationSeconds: item?.durationMs === undefined ? undefined : item.durationMs / 1000,
					status: 'idle',
				});
			}

			persistence.bindQueue();
		},

		loadQueue: (items) => {
			if (items.length === 0) return;

			set({
				...loadedQueue(queueState(), stamped(items)),
				currentTimeSeconds: 0,
				durationSeconds: undefined,
				status: 'idle',
			});
		},

		moveItem: (from, to) => {
			const state = queueState();
			if (isSectioned(state.queue) || !canMove(state.queue.length, from, to)) return;

			set(movedItem(state, from, to));
		},

		playRelease: (releaseItems) => {
			enqueue(releaseItems);
		},

		playTrack: (releaseItems, trackId) => {
			enqueue(releaseItems, trackId);
		},

		queueTrack: (releaseItems, trackId) => {
			const appended = appendedQueue(queueState(), stamped(releaseItems), trackId);
			if (!appended) return;

			set(appended.state);
		},

		removeAt: (index) => {
			const state = queueState();
			if (index < 0 || index >= state.queue.length) return;

			if (index === state.currentIndex) {
				playback.unload();
				set({
					...removedAt(state, index),
					currentTimeSeconds: 0,
					durationSeconds: undefined,
					status: 'idle',
				});
				return;
			}

			set(removedAt(state, index));
		},

		replaceAfter: (index, items) => {
			const state = queueState();
			if (index < 0 || index >= state.queue.length) return;
			if (state.currentIndex !== undefined && state.currentIndex > index) return;

			set(replacedAfter(state, index, stamped(items)));
		},

		toggleShuffle: () => {
			const state = queueState();
			if (isSectioned(state.queue)) return;

			set(shuffledQueue(state, !state.isShuffling));
		},
	};
}
