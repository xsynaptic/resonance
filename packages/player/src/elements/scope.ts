import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { template } from '#lib/render.ts';
import { traceSignal } from '#lib/scope-trace.ts';

const renderCanvas = template(
	'<canvas aria-hidden="true" class="player-scope"></canvas>',
	HTMLCanvasElement,
);

export class PlayerScope extends PlayerElement {
	readonly #canvas = renderCanvas();

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);
		let trace: AbortController | undefined;

		this.appendOnce(this.#canvas);
		signal.addEventListener(
			'abort',
			() => {
				trace?.abort();
			},
			{ once: true },
		);
		bind(
			store,
			isTracing,
			(shouldTrace) => {
				trace?.abort();
				trace = undefined;
				if (!shouldTrace) return;

				const analyser = store.getState().getAnalyser();
				if (!analyser) return;

				trace = new AbortController();
				traceSignal(this.#canvas, analyser, trace.signal);
			},
			signal,
		);
	}
}

function isTracing(state: PlayerStore): boolean {
	return state.status === 'playing' && !state.isOverlayOpen;
}
