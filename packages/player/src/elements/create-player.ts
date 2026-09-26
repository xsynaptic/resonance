import type { PlayerStoreApi } from '#store/player-types.ts';
import type { PlayerLabels, PlayerUrls } from '#types.ts';

import { definePlayerElements } from '#elements/define.ts';

export interface PlayerOptions {
	isArtworkEnabled?: boolean;
	isOverlayEnabled?: boolean;
	isPanelEnabled?: boolean;
	isScopeEnabled?: boolean;
	labels: PlayerLabels;
	seekSeconds?: number;
	store: PlayerStoreApi;
	urls: PlayerUrls;
}

// The bar reads its options once, as it connects
export function createPlayer({
	isArtworkEnabled,
	isOverlayEnabled,
	isPanelEnabled,
	isScopeEnabled,
	labels,
	seekSeconds,
	store,
	urls,
}: PlayerOptions): HTMLElementTagNameMap['player-root'] {
	definePlayerElements();

	const root = document.createElement('player-root');

	root.labels = labels;
	root.store = store;
	if (isArtworkEnabled !== undefined) root.isArtworkEnabled = isArtworkEnabled;
	if (isOverlayEnabled !== undefined) root.isOverlayEnabled = isOverlayEnabled;
	if (isPanelEnabled !== undefined) root.isPanelEnabled = isPanelEnabled;
	if (isScopeEnabled !== undefined) root.isScopeEnabled = isScopeEnabled;
	store.getState().configure({ seekSeconds, urls });
	root.append(document.createElement('player-bar'));

	return root;
}
