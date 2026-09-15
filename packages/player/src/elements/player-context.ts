import type { StoreApi } from 'zustand/vanilla';

import type { PlayerRoot } from '#elements/player-root.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels } from '#types.ts';

export interface PlayerContext {
	labels: PlayerLabels;
	root: PlayerRoot;
	store: StoreApi<PlayerStore>;
}

// Thrown rather than skipped, so a tag placed outside a root fails where it was placed
export function playerContext(element: Element): PlayerContext {
	const root = element.closest('player-root');

	if (!root?.store || !root.labels) {
		throw new Error(
			`<${element.localName}> sits outside a <player-root> holding a store and labels`,
		);
	}

	return { labels: root.labels, root, store: root.store };
}
