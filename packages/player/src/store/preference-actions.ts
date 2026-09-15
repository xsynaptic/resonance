import type { StoreApi } from 'zustand/vanilla';

import type { PlaybackController } from '#store/playback-controller.ts';
import type { PlayerPersistence } from '#store/player-persistence.ts';
import type { PlayerActions, PlayerStore } from '#store/player-types.ts';

import { stepPanelZoom } from '#waveform/panel-zoom.ts';

type PreferenceActions = Pick<
	PlayerActions,
	| 'configure'
	| 'hydratePreferences'
	| 'setOverlayOpen'
	| 'setPanelOpen'
	| 'setTrayOpen'
	| 'setVolume'
	| 'toggleMute'
	| 'toggleOverlay'
	| 'togglePanel'
	| 'toggleTimeMode'
	| 'toggleTray'
	| 'zoomPanel'
>;

export function createPreferenceActions({
	api,
	persistence,
	playback,
}: {
	api: StoreApi<PlayerStore>;
	persistence: PlayerPersistence;
	playback: PlaybackController;
}): PreferenceActions {
	const { getState: get, setState: set } = api;

	let volumeBeforeMute: number | undefined;

	function applyVolume(volume: number): void {
		const applied = playback.setVolume(volume);

		set({ volume: applied });
		persistence.persistVolume(applied);
	}

	return {
		configure: ({ urls }) => {
			if (get().urls === urls) return;

			set({ urls });
		},

		hydratePreferences: () => {
			const { timeMode, volume } = persistence.readPreferences();

			if (timeMode !== undefined) set({ timeMode });
			if (volume === undefined) return;

			// Not persisted back: this is the stored value arriving, not the listener moving the slider
			set({ volume: playback.setVolume(volume) });
		},

		setOverlayOpen: (isOpen) => {
			if (get().isOverlayOpen === isOpen) return;

			set({ isOverlayOpen: isOpen });
		},

		setPanelOpen: (isOpen) => {
			if (get().isPanelOpen === isOpen) return;

			set({ isPanelOpen: isOpen });
		},

		setTrayOpen: (isOpen) => {
			if (get().isTrayOpen === isOpen) return;

			set({ isTrayOpen: isOpen });
		},

		setVolume: (volume) => {
			applyVolume(volume);
		},

		toggleMute: () => {
			const { volume } = get();
			if (volume > 0) {
				volumeBeforeMute = volume;
				applyVolume(0);
				return;
			}

			applyVolume(volumeBeforeMute ?? 1);
		},

		toggleOverlay: () => {
			set((state) => ({ isOverlayOpen: !state.isOverlayOpen }));
		},

		togglePanel: () => {
			set((state) => ({ isPanelOpen: !state.isPanelOpen }));
		},

		toggleTimeMode: () => {
			const timeMode = get().timeMode === 'elapsed' ? 'remaining' : 'elapsed';

			set({ timeMode });
			persistence.persistTimeMode(timeMode);
		},

		toggleTray: () => {
			set((state) => ({ isTrayOpen: !state.isTrayOpen }));
		},

		zoomPanel: (steps) => {
			set((state) => ({ panelPxPerSecond: stepPanelZoom(state.panelPxPerSecond, steps) }));
		},
	};
}
