import type { StoreApi } from 'zustand/vanilla';

import { useEffect } from 'react';

import type { PlayerStore } from '#store/player-store.ts';

import { usePlayerStoreApi } from '#store/context.tsx';

// Touch fires `pointerenter` with the tap, so a toggle's hover preload gives a touch open no head start
export function preloadWhenQueued(store: StoreApi<PlayerStore>, preload: () => void): () => void {
	let cancelIdle: (() => void) | undefined;

	const schedule = (state: PlayerStore): void => {
		if (cancelIdle !== undefined || state.queue.length === 0) return;

		unsubscribe();
		cancelIdle = requestIdle(preload);
	};
	const unsubscribe = store.subscribe(schedule);

	schedule(store.getState());

	return () => {
		unsubscribe();
		cancelIdle?.();
	};
}

export function usePreloadWhenQueued(preload: () => void): void {
	const store = usePlayerStoreApi();

	useEffect(() => preloadWhenQueued(store, preload), [store, preload]);
}

// Safari has no `requestIdleCallback`
function requestIdle(callback: () => void): () => void {
	if (typeof requestIdleCallback === 'function') {
		const handle = requestIdleCallback(callback);

		return () => {
			cancelIdleCallback(handle);
		};
	}

	const handle = setTimeout(callback, 200);

	return () => {
		clearTimeout(handle);
	};
}
