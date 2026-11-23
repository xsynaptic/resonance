import type { PlayerStoreApi } from '@xsynaptic/plazmoid-core';

import type { PlayerRoot } from '#elements/player-root.ts';
import type { PlayerLabels } from '#types.ts';
import type { ViewStoreApi } from '#view/view-store.ts';

export interface PlayerContext {
	labels: PlayerLabels;
	root: PlayerRoot;
	store: PlayerStoreApi;
	view: ViewStoreApi;
}

export function playbackStore({ store }: PlayerContext): PlayerStoreApi {
	return store;
}

// Thrown rather than skipped, so a tag placed outside a root fails where it was placed
export function playerContext(element: Element): PlayerContext {
	const root = element.closest('pzm-root');

	if (!root?.store || !root.view || !root.labels) {
		throw new Error(
			`<${element.localName}> sits outside a <pzm-root> holding a store, a view store and labels`,
		);
	}

	return { labels: root.labels, root, store: root.store, view: root.view };
}

export function viewStore({ view }: PlayerContext): ViewStoreApi {
	return view;
}
