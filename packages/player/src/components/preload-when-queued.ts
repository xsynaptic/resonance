import { useEffect } from 'react';

import { preloadWhenQueued } from '#lib/preload-when-queued.ts';
import { usePlayerStoreApi } from '#store/context.tsx';

export function usePreloadWhenQueued(preload: () => void): void {
	const store = usePlayerStoreApi();

	useEffect(() => preloadWhenQueued(store, preload), [store, preload]);
}
