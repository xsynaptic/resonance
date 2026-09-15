import type { StoreApi } from 'zustand/vanilla';

import { shallow } from 'zustand/vanilla/shallow';

import type { PlayerStore } from '#store/player-types.ts';

// Compared shallowly, so a selector can return a fresh view object and still write nothing when no field moved
// eslint-disable-next-line max-params -- store, selection, write and lifetime read left to right at every call site
export function bind<Selected>(
	store: StoreApi<PlayerStore>,
	select: (state: PlayerStore) => Selected,
	apply: (selected: Selected) => void,
	signal: AbortSignal,
): void {
	let applied = select(store.getState());

	apply(applied);

	const unsubscribe = store.subscribe((state) => {
		const selected = select(state);
		if (shallow(selected, applied)) return;

		applied = selected;
		apply(selected);
	});

	signal.addEventListener('abort', unsubscribe, { once: true });
}
