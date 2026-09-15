import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';

import { preloadWhenQueued } from '#lib/preload-when-queued.ts';

export interface Preloadable {
	preload: () => void;
	store: StoreApi<PlayerStore>;
	trigger: HTMLElement;
}

export function bindPreload({ preload, store, trigger }: Preloadable, signal: AbortSignal): void {
	trigger.addEventListener('pointerenter', preload, { signal });
	trigger.addEventListener('focus', preload, { signal });
	signal.addEventListener('abort', preloadWhenQueued(store, preload), { once: true });
}
