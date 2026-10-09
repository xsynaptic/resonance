import type { StoreApi } from 'zustand/vanilla';

import type { PlaybackController } from '#store/playback-controller.ts';
import type { PlayerPersistence } from '#store/player-persistence.ts';
import type { PlayerActions, PlayerState, PlayerStore } from '#store/player-types.ts';

import { isPanelZoom, stepPanelZoom } from '#store/zoom-levels.ts';

// Unmuting into silence would read as a dead button
const unmuteVolume = 0.25;

type PreferenceActions = Pick<
	PlayerActions,
	| 'configure'
	| 'setOverlayOpen'
	| 'setPanelOpen'
	| 'setPanelZoom'
	| 'setScrubPreview'
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
}): PreferenceActions & { hydratePreferences: () => void } {
	const { getState: get, setState: set } = api;

	function applyVolume({ isMuted, volume }: Pick<PlayerState, 'isMuted' | 'volume'>): void {
		set({ isMuted, volume });
		playback.syncVolume();
	}

	function applyPanelZoom(panelPxPerSecond: number): void {
		if (get().panelPxPerSecond === panelPxPerSecond) return;

		set({ panelPxPerSecond });
	}

	return {
		configure: ({ seekSeconds = get().seekSeconds, urls = get().urls }) => {
			if (get().seekSeconds === seekSeconds && get().urls === urls) return;

			set({ seekSeconds, urls });
		},

		hydratePreferences: () => {
			const { isMuted, isPanelOpen, panelPxPerSecond, timeMode, volume } =
				persistence.readPreferences();

			// Before persistence binds, so a stored value arriving is not written back
			if (isMuted !== undefined) set({ isMuted });
			if (isPanelOpen !== undefined) set({ isPanelOpen });
			if (panelPxPerSecond !== undefined) set({ panelPxPerSecond });
			if (timeMode !== undefined) set({ timeMode });
			if (volume !== undefined) set({ volume: clampVolume(volume) });
		},

		setOverlayOpen: (isOpen) => {
			if (get().isOverlayOpen === isOpen) return;

			set({ isOverlayOpen: isOpen });
		},

		setPanelOpen: (isOpen) => {
			if (get().isPanelOpen === isOpen) return;

			set({ isPanelOpen: isOpen });
		},

		setPanelZoom: (pxPerSecond) => {
			if (isPanelZoom(pxPerSecond)) applyPanelZoom(pxPerSecond);
		},

		setScrubPreview: (seconds) => {
			const scrubPreviewSeconds = seconds === undefined ? undefined : Math.floor(seconds);

			if (get().scrubPreviewSeconds === scrubPreviewSeconds) return;

			set({ scrubPreviewSeconds });
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
			set((state) => ({ isPanelOpen: !state.isPanelOpen }));
		},

		toggleTimeMode: () => {
			set({ timeMode: get().timeMode === 'elapsed' ? 'remaining' : 'elapsed' });
		},

		toggleTray: () => {
			set((state) => ({ isTrayOpen: !state.isTrayOpen }));
		},

		zoomPanel: (steps) => {
			applyPanelZoom(stepPanelZoom(get().panelPxPerSecond, steps));
		},
	};
}

function clampVolume(volume: number): number {
	return Math.min(1, Math.max(0, volume));
}
