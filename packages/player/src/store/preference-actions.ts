import type { StoreApi } from 'zustand/vanilla';

import type { PlaybackController } from '#store/playback-controller.ts';
import type { PlayerPersistence } from '#store/player-persistence.ts';
import type { PlayerActions, PlayerState, PlayerStore } from '#store/player-types.ts';

import { stepPanelZoom } from '#store/zoom-levels.ts';

// Unmuting into silence would read as a dead button
const unmuteVolume = 0.25;

type PreferenceActions = Pick<
	PlayerActions,
	| 'configure'
	| 'hydratePreferences'
	| 'setOverlayOpen'
	| 'setPanelOpen'
	| 'setTrayOpen'
	| 'setVolume'
	| 'toggleMuted'
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

	function applyVolume({ isMuted, volume }: Pick<PlayerState, 'isMuted' | 'volume'>): void {
		const previous = get();

		set({ isMuted, volume });
		playback.syncVolume();

		if (volume !== previous.volume) persistence.persistVolume(volume);
		if (isMuted !== previous.isMuted) persistence.persistMuted(isMuted);
	}

	return {
		configure: ({ urls }) => {
			if (get().urls === urls) return;

			set({ urls });
		},

		hydratePreferences: () => {
			const { isMuted, isPanelOpen, panelPxPerSecond, timeMode, volume } =
				persistence.readPreferences();

			// Not persisted back: this is the stored value arriving, not the listener moving the slider
			if (isMuted !== undefined) set({ isMuted });
			if (isPanelOpen !== undefined) set({ isPanelOpen });
			if (panelPxPerSecond !== undefined) set({ panelPxPerSecond });
			if (timeMode !== undefined) set({ timeMode });
			if (volume !== undefined) set({ volume: clampVolume(volume) });

			playback.syncVolume();
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

		toggleOverlay: () => {
			set((state) => ({ isOverlayOpen: !state.isOverlayOpen }));
		},

		togglePanel: () => {
			const isPanelOpen = !get().isPanelOpen;

			set({ isPanelOpen });
			persistence.persistPanelOpen(isPanelOpen);
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
			const panelPxPerSecond = stepPanelZoom(get().panelPxPerSecond, steps);

			set({ panelPxPerSecond });
			persistence.persistPanelZoom(panelPxPerSecond);
		},
	};
}

function clampVolume(volume: number): number {
	return Math.min(1, Math.max(0, volume));
}
