import type { StoreApi } from 'zustand/vanilla';

import type { PlaybackController } from '#store/playback-controller.ts';
import type { PlayerActions, PlayerStore } from '#store/player-types.ts';

import { previousInOrder } from '#queue/queue.ts';

// Past this many seconds into a track, previous restarts it instead of stepping back
const restartThresholdSeconds = 3;

type TransportActions = Pick<
	PlayerActions,
	| 'getAnalyser'
	| 'getCurrentTime'
	| 'getOutputDelay'
	| 'next'
	| 'pause'
	| 'playAt'
	| 'previous'
	| 'seek'
	| 'seekBy'
	| 'stop'
	| 'togglePlay'
>;

export function createTransportActions({
	api,
	playback,
}: {
	api: StoreApi<PlayerStore>;
	playback: PlaybackController;
}): TransportActions {
	const { getState: get, setState: set } = api;

	return {
		getAnalyser: playback.analyser,
		getCurrentTime: playback.currentTime,
		getOutputDelay: playback.outputDelay,
		next: playback.advance,
		pause: playback.pause,

		playAt: (index) => {
			if (index < 0 || index >= get().queue.length) return;

			playback.loadIndex(index, true);
		},

		previous: () => {
			const { currentIndex, playOrder } = get();
			if (currentIndex === undefined) return;

			const back = previousInOrder(playOrder, currentIndex);

			if (back === undefined || (playback.currentTime() ?? 0) > restartThresholdSeconds) {
				playback.seek(0);
				return;
			}

			playback.loadIndex(back, true);
		},

		seek: (seconds) => {
			playback.seek(seconds);
			set({ currentTimeSeconds: seconds });
		},

		seekBy: (deltaSeconds) => {
			const { currentTimeSeconds, durationSeconds } = get();
			if (durationSeconds === undefined) return;

			get().seek(Math.min(durationSeconds, Math.max(0, currentTimeSeconds + deltaSeconds)));
		},

		stop: () => {
			playback.unload();
			set({ currentTimeSeconds: 0, status: 'idle' });
		},

		togglePlay: () => {
			const state = get();
			if (state.currentIndex === undefined) {
				const first = state.playOrder[0];
				if (first === undefined) return;

				playback.loadIndex(first, true);
				return;
			}

			if (state.status === 'error') {
				playback.loadIndex(state.currentIndex, true, { resumeAtSeconds: state.currentTimeSeconds });
				return;
			}

			// A restored or stopped queue is positioned with nothing in the engine, so the press loads it where it stands
			if (!playback.holdsTrack(state.queue[state.currentIndex]?.queueId)) {
				playback.loadIndex(state.currentIndex, true, { resumeAtSeconds: state.currentTimeSeconds });
				return;
			}

			if (state.status === 'playing') {
				playback.pause();
				return;
			}

			playback.play();
		},
	};
}
