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
	refreshedQueue,
	removedAt,
	shuffledQueue,
	stampQueue,
} from '#queue/queue-state.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { canMove } from '#queue/reorder.ts';

type QueueActions = Pick<
	PlayerActions,
	| 'clearQueue'
	| 'hydrateQueue'
	| 'loadQueue'
	| 'moveItem'
	| 'playQueue'
	| 'playTrack'
	| 'queueTrack'
	| 'refreshQueue'
	| 'removeAt'
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
	function enqueue(items: ReadonlyArray<QueueItem>, itemId?: string): void {
		const appended = appendedQueue(queueState(), stamped(items), itemId);
		if (!appended) return;

		if (appended.loadIndex === get().currentIndex) {
			get().togglePaused();
			return;
		}

		set(appended.state);
		playback.loadIndex(appended.loadIndex, true);
	}

	return {
		clearQueue: () => {
			playback.unload();
			set({ currentIndex: undefined, durationSeconds: undefined, playOrder: [], queue: [] });
		},

		hydrateQueue: () => {
			const stored = persistence.readQueue();

			// A page that queued something before this ran keeps what it queued
			if (stored && get().queue.length === 0) {
				const restored = {
					...loadedQueue(queueState(), stamped(stored.queue)),
					currentIndex: stored.currentIndex,
				};
				const item =
					stored.currentIndex === undefined ? undefined : stored.queue[stored.currentIndex];

				set({
					...(stored.playOrder === undefined
						? shuffledQueue(restored, stored.isShuffling)
						: { ...restored, isShuffling: true, playOrder: stored.playOrder }),
					currentTimeSeconds: stored.currentTimeSeconds,
					durationSeconds: toDurationSeconds(item),
					status: 'idle',
				});
			}

			persistence.bindQueue();
		},

		loadQueue: (items) => {
			if (items.length === 0) return;

			playback.unload();
			set({ ...loadedQueue(queueState(), stamped(items)), durationSeconds: undefined });
		},

		moveItem: (from, to) => {
			const state = queueState();
			if (!canMove(state.queue.length, from, to)) return;

			set(movedItem(state, from, to));
		},

		playQueue: (items) => {
			if (items.length === 0) return;

			get().clearQueue();
			enqueue(items);
		},

		playTrack: (releaseItems, itemId) => {
			enqueue(releaseItems, itemId);
		},

		queueTrack: (releaseItems, itemId) => {
			const appended = appendedQueue(queueState(), stamped(releaseItems), itemId);
			if (!appended) return;

			set(appended.state);
		},

		refreshQueue: (items) => {
			const queue = refreshedQueue(get().queue, items);

			if (queue) set({ queue });
		},

		removeAt: (index) => {
			const state = queueState();
			if (index < 0 || index >= state.queue.length) return;

			if (index === state.currentIndex) {
				playback.unload();
				set({ ...removedAt(state, index), durationSeconds: undefined });
				return;
			}

			set(removedAt(state, index));
		},

		toggleShuffle: () => {
			const state = queueState();

			set(shuffledQueue(state, !state.isShuffling));
		},
	};
}
