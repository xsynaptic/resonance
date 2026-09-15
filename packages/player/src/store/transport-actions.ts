import type { StoreApi } from 'zustand/vanilla';

import type { PlaybackController } from '#store/playback-controller.ts';
import type { PlayerActions, PlayerStore } from '#store/player-types.ts';

import { nextInOrder, previousInOrder } from '#queue/queue.ts';
import { restartThresholdSeconds } from '#store/selectors.ts';

type TransportActions = Pick<
	PlayerActions,
	| 'getAnalyser'
	| 'getCurrentTime'
	| 'getOutputDelay'
	| 'next'
	| 'pause'
	| 'play'
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
		// At the end of the play order, stop without wrapping
		next: () => {
			const { currentIndex, playOrder } = get();
			if (currentIndex === undefined) return;

			const upcoming = nextInOrder(playOrder, currentIndex);
			if (upcoming === undefined) {
				get().stop();
				return;
			}

			playback.loadIndex(upcoming, true);
		},
		pause: playback.pause,
		play: playback.play,

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

		stop: playback.unload,

		togglePlay: () => {
			if (get().isPlayIntended) {
				playback.pause();
				return;
			}

			playback.play();
		},
	};
}
