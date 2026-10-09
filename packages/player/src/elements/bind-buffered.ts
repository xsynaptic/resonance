import type { SonicSlider, SonicWavestrip } from '@xsynaptic/sonic-ui';

import type { PlayerStoreApi } from '#store/player-store.ts';

import { bind } from '#lib/bind.ts';

const bufferedEvents = ['emptied', 'loadeddata', 'progress', 'suspend'] as const;

export function bindBuffered(
	control: SonicSlider | SonicWavestrip,
	store: PlayerStoreApi,
	signal: AbortSignal,
): void {
	bind(
		store,
		(state) => state.getMediaElement(),
		(element) => {
			const showBuffered = (): void => {
				control.buffered = element?.buffered;
			};

			for (const type of bufferedEvents) element?.addEventListener(type, showBuffered, { signal });
			showBuffered();
		},
		signal,
	);
}
