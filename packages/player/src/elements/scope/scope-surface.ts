import { SonicWaveform } from '@xsynaptic/sonic-ui';

import type { PlayerStoreApi } from '#store/player-types.ts';

import { defineOnce } from '#elements/define-once.ts';
import { observeResize } from '#lib/observe-resize.ts';
import { bindLoadedWaveform } from '#waveform/bind-loaded-waveform.ts';

const windowSeconds = 1;

export interface ScopeSurface {
	trace: (isTracing: boolean) => void;
}

export function connectScopeSurface(
	box: HTMLElement,
	store: PlayerStoreApi,
	signal: AbortSignal,
): ScopeSurface {
	defineOnce('sonic-waveform', SonicWaveform);

	const waveform = document.createElement('sonic-waveform');

	waveform.inert = true;
	waveform.reducedMotion = 'scroll';
	box.replaceChildren(waveform);

	observeResize(
		box,
		() => {
			if (box.clientWidth > 0) waveform.zoom = box.clientWidth / windowSeconds;
		},
		signal,
	);
	bindLoadedWaveform(waveform, store, signal, { isTinted: false, showsPending: false });

	return {
		trace: (isTracing) => {
			waveform.playing = isTracing;
		},
	};
}
