import type { ComponentType } from 'react';

import { createElement, lazy } from 'react';

export function createLazyPart<Props extends object>(load: () => Promise<ComponentType<Props>>) {
	let current = createLazy();

	function createLazy() {
		return lazy(async () => ({ default: await load() }));
	}

	return {
		Component: (props: Props) => createElement(current, props),
		preload: (): void => {
			void settle(load());
		},
		// React caches a rejected lazy; swapped only once caught, since a swap before React's retry render imports again unseen
		reset: (): void => {
			current = createLazy();
		},
	};
}

async function settle(pending: Promise<unknown>): Promise<void> {
	try {
		await pending;
	} catch {
		// A failed preload surfaces again on open, where `PartBoundary` closes the part
	}
}
