import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';

import { preloadWhenQueued } from '#lib/preload-when-queued.ts';

interface Preloadable {
	preload: () => void;
	store: StoreApi<PlayerStore>;
	trigger: HTMLElement;
}

export function bindPreload({ preload, store, trigger }: Preloadable, signal: AbortSignal): void {
	const stopWatchingQueue = preloadWhenQueued(store, preload);

	trigger.addEventListener('pointerenter', preload, { signal });
	trigger.addEventListener('focus', preload, { signal });
	signal.addEventListener('abort', stopWatchingQueue, { once: true });
}
