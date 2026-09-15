import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';

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
