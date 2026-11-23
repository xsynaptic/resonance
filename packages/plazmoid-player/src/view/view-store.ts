import type { PlayerStorage } from '@xsynaptic/plazmoid-core';
import type { StoreApi } from 'zustand/vanilla';

import { createStore } from 'zustand/vanilla';

import type { PlayerTimeMode } from '#types.ts';

import { bindViewPersistence, readStoredView } from '#view/view-persistence.ts';
import { isPanelZoom, panelZoomDefault, stepPanelZoom } from '#view/zoom-levels.ts';

// Property syntax so an element can select one action without tripping `unbound-method`
interface ViewActions {
	setOverlayOpen: (isOpen: boolean) => void;
	setPanelOpen: (isOpen: boolean) => void;
	setPanelZoom: (pxPerSecond: number) => void;
	setScrubPreview: (seconds: number | undefined) => void;
	setTrayOpen: (isOpen: boolean) => void;
	toggleOverlay: () => void;
	// Its open state is persisted, as the time mode is
	togglePanel: () => void;
	toggleTimeMode: () => void;
	toggleTray: () => void;
	zoomPanel: (steps: number) => void;
}

export interface ViewState {
	isOverlayOpen: boolean;
	isPanelOpen: boolean;
	isTrayOpen: boolean;
	// How many CSS pixels of the panel one second of audio takes
	panelPxPerSecond: number;
	scrubPreviewSeconds: number | undefined;
	// A listener preference about a readout, so it is persisted
	timeMode: PlayerTimeMode;
}

export type ViewStore = ViewActions & ViewState;

export type ViewStoreApi = Omit<StoreApi<ViewStore>, 'setState'>;

export interface ViewStoreOptions {
	storage?: PlayerStorage | undefined;
}

const initialViewState: ViewState = {
	isOverlayOpen: false,
	isPanelOpen: false,
	isTrayOpen: false,
	panelPxPerSecond: panelZoomDefault,
	scrubPreviewSeconds: undefined,
	timeMode: 'elapsed',
};

export function createViewStore(options?: ViewStoreOptions): ViewStoreApi {
	const store = createStore<ViewStore>()((set, get) => {
		function applyPanelZoom(panelPxPerSecond: number): void {
			if (get().panelPxPerSecond === panelPxPerSecond) return;

			set({ panelPxPerSecond });
		}

		return {
			...initialViewState,
			...readStoredView(options?.storage),

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
	});

	// After the stored state lands in the initializer, so restoring it writes nothing back
	bindViewPersistence(store, options?.storage);

	return store;
}
