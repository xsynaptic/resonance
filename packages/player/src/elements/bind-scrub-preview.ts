import type { SonicSlider, SonicWavestrip } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';

export function bindScrubPreview(
	control: SonicSlider | SonicWavestrip,
	preview: PlayerStore['setScrubPreview'],
	signal: AbortSignal,
): void {
	const showPreview = (): void => {
		const isShown = control.pointerType === 'touch' && control.revealed;

		preview(isShown ? control.value : undefined);
	};

	control.addEventListener('input', showPreview, { signal });
	control.addEventListener('sonic-reveal', showPreview, { signal });
	signal.addEventListener(
		'abort',
		() => {
			preview(undefined);
		},
		{ once: true },
	);
}
