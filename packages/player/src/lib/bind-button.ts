import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';

import { bind } from '#lib/bind.ts';

interface ButtonBinding<Selected> {
	apply: (selected: Selected) => void;
	button: HTMLButtonElement;
	press: (state: PlayerStore) => void;
	select: (state: PlayerStore) => Selected;
	store: StoreApi<PlayerStore>;
}

export function bindButton<Selected>(binding: ButtonBinding<Selected>, signal: AbortSignal): void {
	const { apply, button, press, select, store } = binding;

	button.addEventListener(
		'click',
		() => {
			press(store.getState());
		},
		{ signal },
	);
	bind(store, select, apply, signal);
}
