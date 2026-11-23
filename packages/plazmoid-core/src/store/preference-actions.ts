import type { StoreApi } from 'zustand/vanilla';

import type { PlaybackController } from '#store/playback-controller.ts';
import type { PlayerPersistence } from '#store/player-persistence.ts';
import type { PlayerActions, PlayerState, PlayerStore } from '#store/player-types.ts';

// Unmuting into silence would read as a dead button
const unmuteVolume = 0.25;

type PreferenceActions = Pick<PlayerActions, 'configure' | 'setVolume' | 'toggleMuted'>;

export function createPreferenceActions({
	api,
	persistence,
	playback,
}: {
	api: StoreApi<PlayerStore>;
	persistence: PlayerPersistence;
	playback: PlaybackController;
}): PreferenceActions & { hydratePreferences: () => void } {
	const { getState: get, setState: set } = api;

	function applyVolume({ isMuted, volume }: Pick<PlayerState, 'isMuted' | 'volume'>): void {
		set({ isMuted, volume });
		playback.syncVolume();
	}

	return {
		configure: ({ seekSeconds = get().seekSeconds, urls = get().urls }) => {
			if (get().seekSeconds === seekSeconds && get().urls === urls) return;

			set({ seekSeconds, urls });
		},

		hydratePreferences: () => {
			const { isMuted, volume } = persistence.readPreferences();

			// Before persistence binds, so a stored value arriving is not written back
			if (isMuted !== undefined) set({ isMuted });
			if (volume !== undefined) set({ volume: clampVolume(volume) });
		},

		setVolume: (volume) => {
			const clamped = clampVolume(volume);

			applyVolume({ isMuted: get().isMuted && clamped === 0, volume: clamped });
		},

		toggleMuted: () => {
			const { isMuted, volume } = get();

			if (!isMuted && volume > 0) {
				applyVolume({ isMuted: true, volume });
				return;
			}

			applyVolume({ isMuted: false, volume: volume === 0 ? unmuteVolume : volume });
		},
	};
}

function clampVolume(volume: number): number {
	return Math.min(1, Math.max(0, volume));
}
