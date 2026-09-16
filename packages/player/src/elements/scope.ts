import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { traceSignal } from '#elements/scope-trace.ts';
import { bind } from '#lib/bind.ts';
import { template } from '#lib/render.ts';
import { supersede } from '#lib/supersede.ts';

const renderCanvas = template(
	'<canvas aria-hidden="true" class="player-scope"></canvas>',
	HTMLCanvasElement,
);

export class PlayerScope extends PlayerElement {
	readonly #canvas = renderCanvas();

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);
		const trace = supersede(signal);

		this.appendOnce(this.#canvas);
		bind(
			store,
			isTracing,
			(shouldTrace) => {
				trace.cancel();
				if (!shouldTrace) return;

				const analyser = store.getState().getAnalyser();
				if (!analyser) return;

				traceSignal(this.#canvas, analyser, trace.next());
			},
			signal,
		);
	}
}

function isTracing(state: PlayerStore): boolean {
	return state.status === 'playing' && !state.isOverlayOpen;
}
