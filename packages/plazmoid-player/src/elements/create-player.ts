import type { PlayerStoreApi, PlayerUrls } from '@xsynaptic/plazmoid-core';

import type { PlayerLabels } from '#types.ts';
import type { ViewStoreApi } from '#view/view-store.ts';

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
	view: ViewStoreApi;
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
	view,
}: PlayerOptions): HTMLElementTagNameMap['pzm-root'] {
	definePlayerElements();

	const root = document.createElement('pzm-root');

	root.labels = labels;
	root.store = store;
	root.view = view;
	if (isArtworkEnabled !== undefined) root.isArtworkEnabled = isArtworkEnabled;
	if (isOverlayEnabled !== undefined) root.isOverlayEnabled = isOverlayEnabled;
	if (isPanelEnabled !== undefined) root.isPanelEnabled = isPanelEnabled;
	if (isScopeEnabled !== undefined) root.isScopeEnabled = isScopeEnabled;
	store.getState().configure({ seekSeconds, urls });
	root.append(document.createElement('pzm-bar'));

	return root;
}
