import type { StoreApi } from 'zustand/vanilla';

import { createStore } from 'zustand/vanilla';

import type { PlayerState, PlayerStore, PlayerStoreOptions } from '#store/player-types.ts';

import { createAudioEngine } from '#engine/audio-engine.ts';
import { createPlaybackController } from '#store/playback-controller.ts';
import { createPlayerPersistence, inertPersistence } from '#store/player-persistence.ts';
import { createPreferenceActions } from '#store/preference-actions.ts';
import { createQueueActions } from '#store/queue-actions.ts';
import { createTransportActions } from '#store/transport-actions.ts';
import { panelZoomDefault } from '#waveform/zoom-levels.ts';

export type { PlayerStore, PlayerStoreOptions } from '#store/player-types.ts';

const initialPlayerState: PlayerState = {
	currentIndex: undefined,
	currentTimeSeconds: 0,
	durationSeconds: undefined,
	isMuted: false,
	isOverlayOpen: false,
	isPanelOpen: false,
	isPaused: true,
	isShuffling: false,
	isTrayOpen: false,
	panelPxPerSecond: panelZoomDefault,
	playbackError: undefined,
	playOrder: [],
	queue: [],
	status: 'idle',
	timeMode: 'elapsed',
	urls: undefined,
	volume: 1,
};

// The action groups reach each other through `get()`, so they compose as one flat dispatch table
export function createPlayerStore(options?: PlayerStoreOptions): StoreApi<PlayerStore> {
	const createEngine = options?.createEngine ?? createAudioEngine;

	return createStore<PlayerStore>()((_set, _get, api) => {
		const persistence =
			options?.isPersistent === false ? inertPersistence : createPlayerPersistence(api);
		const playback = createPlaybackController(api, createEngine);

		return {
			...initialPlayerState,
			...createPreferenceActions({ api, persistence, playback }),
			...createQueueActions({ api, persistence, playback }),
			...createTransportActions({ api, playback }),
		};
	});
}

export const playerStore = createPlayerStore();
