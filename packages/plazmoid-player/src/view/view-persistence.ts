import type { PlayerStorage } from '@xsynaptic/plazmoid-core';

import { readStored, writeStored } from '@xsynaptic/plazmoid-core';

import type { PlayerTimeMode } from '#types.ts';
import type { ViewState, ViewStoreApi } from '#view/view-store.ts';

import { panelOpenStorageKey, panelZoomStorageKey, timeModeStorageKey } from '#constants.ts';
import { isPanelZoom } from '#view/zoom-levels.ts';

type StoredView = Partial<Pick<ViewState, 'isPanelOpen' | 'panelPxPerSecond' | 'timeMode'>>;

export function bindViewPersistence(store: ViewStoreApi, storage: PlayerStorage | undefined): void {
	store.subscribe((state, previous) => {
		if (state.isPanelOpen !== previous.isPanelOpen) {
			writeStored(storage, panelOpenStorageKey, String(state.isPanelOpen));
		}

		if (state.panelPxPerSecond !== previous.panelPxPerSecond) {
			writeStored(storage, panelZoomStorageKey, String(state.panelPxPerSecond));
		}

		if (state.timeMode !== previous.timeMode) {
			writeStored(storage, timeModeStorageKey, state.timeMode);
		}
	});
}

// An absent or unreadable entry is left out, so it never spreads `undefined` over a default
export function readStoredView(storage: PlayerStorage | undefined): StoredView {
	const stored: StoredView = {};
	const panelOpen = readStored(storage, panelOpenStorageKey);
	const panelPxPerSecond = readStoredPanelZoom(storage);
	const timeMode = readStoredTimeMode(storage);

	if (panelOpen !== undefined) stored.isPanelOpen = panelOpen === 'true';
	if (panelPxPerSecond !== undefined) stored.panelPxPerSecond = panelPxPerSecond;
	if (timeMode !== undefined) stored.timeMode = timeMode;

	return stored;
}

function readStoredPanelZoom(storage: PlayerStorage | undefined): number | undefined {
	const stored = readStored(storage, panelZoomStorageKey);
	if (stored === undefined) return undefined;

	return isPanelZoom(Number(stored)) ? Number(stored) : undefined;
}

function readStoredTimeMode(storage: PlayerStorage | undefined): PlayerTimeMode | undefined {
	const stored = readStored(storage, timeModeStorageKey);

	return stored === 'elapsed' || stored === 'remaining' ? stored : undefined;
}
