import type { StoreApi } from 'zustand/vanilla';

import { createStore } from 'zustand/vanilla';

import type {
	PlayerState,
	PlayerStore,
	PlayerStoreApi,
	PlayerStoreOptions,
} from '#store/player-types.ts';

import { createAudioEngine } from '#engine/audio-engine.ts';
import { createPlaybackController } from '#store/playback-controller.ts';
import { createPlayerPersistence, inertPersistence } from '#store/player-persistence.ts';
import { createPreferenceActions } from '#store/preference-actions.ts';
import { createQueueActions } from '#store/queue-actions.ts';
import { createTransportActions } from '#store/transport-actions.ts';
import { panelZoomDefault } from '#store/zoom-levels.ts';

export type { PlayerStore, PlayerStoreApi, PlayerStoreOptions } from '#store/player-types.ts';

const initialPlayerState: PlayerState = {
	currentIndex: undefined,
	currentTimeSeconds: 0,
	diagnostic: undefined,
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
	scrubPreviewSeconds: undefined,
	seekSeconds: 10,
	status: 'idle',
	timeMode: 'elapsed',
	urls: undefined,
	volume: 1,
};

export function createPlayerStore(options?: PlayerStoreOptions): PlayerStoreApi {
	return createWritablePlayerStore(options);
}

// The action groups reach each other through `get()`, so they compose as one flat dispatch table
export function createWritablePlayerStore(options?: PlayerStoreOptions): StoreApi<PlayerStore> {
	const createEngine = options?.createEngine ?? createAudioEngine;
	const hydrationSteps: Array<() => void> = [];

	const store = createStore<PlayerStore>()((_set, _get, api) => {
		const persistence =
			options?.isPersistent === false ? inertPersistence : createPlayerPersistence(api);
		const playback = createPlaybackController(api, createEngine);
		const { hydratePreferences, ...preferenceActions } = createPreferenceActions({
			api,
			persistence,
			playback,
		});
		const { hydrateQueue, ...queueActions } = createQueueActions({ api, persistence, playback });

		hydrationSteps.push(hydratePreferences, hydrateQueue);

		return {
			...initialPlayerState,
			...preferenceActions,
			...queueActions,
			...createTransportActions({ api, playback }),
		};
	});

	// Inside the initializer `get()` is empty and its return overwrites any `set`
	for (const hydrate of hydrationSteps) hydrate();

	return store;
}
