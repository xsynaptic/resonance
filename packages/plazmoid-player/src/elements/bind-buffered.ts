import type { PlayerStoreApi } from '@xsynaptic/plazmoid-core';
import type { SonicSlider, SonicWavestrip } from '@xsynaptic/sonic-ui';

import { bind } from '@xsynaptic/plazmoid-core';

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
