import type { StoreApi } from 'zustand/vanilla';

import { bind } from '@xsynaptic/plazmoid-core';

interface ButtonBinding<State, Selected> {
	apply: (selected: Selected) => void;
	button: HTMLElement;
	// Absent for a button whose press lands on the other store, which it binds itself
	press: ((state: State) => void) | undefined;
	select: (state: State) => Selected;
	store: Pick<StoreApi<State>, 'getState' | 'subscribe'>;
}

export function bindButton<State, Selected>(
	binding: ButtonBinding<State, Selected>,
	signal: AbortSignal,
): void {
	const { apply, button, press, select, store } = binding;

	if (press) {
		button.addEventListener(
			'click',
			() => {
				press(store.getState());
			},
			{ signal },
		);
	}

	bind(store, select, apply, signal);
}
