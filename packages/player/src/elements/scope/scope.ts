import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerUrls, QueueItem } from '#types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { traceArchive } from '#elements/scope/scope-archive.ts';
import { bind } from '#lib/bind.ts';
import { template } from '#lib/render.ts';
import { supersede } from '#lib/supersede.ts';
import { loadedItem } from '#store/selectors.ts';

// Wider and a kick is a few pixels; narrower and the archive's 256-sample pairs show as facets
const windowSeconds = 1;

const renderCanvas = template(
	'<canvas aria-hidden="true" class="player-scope"></canvas>',
	HTMLCanvasElement,
);

interface ScopeSource {
	isTracing: boolean;
	item: QueueItem | undefined;
	resolveArchive: PlayerUrls['archive'];
}

export class PlayerScope extends PlayerElement {
	readonly #canvas = renderCanvas();

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);
		const trace = supersede(signal);

		this.appendOnce(this.#canvas);
		bind(
			store,
			selectScopeSource,
			({ isTracing, item, resolveArchive }) => {
				trace.cancel();
				if (!isTracing) return;

				traceArchive(this.#canvas, { item, resolveArchive, store, windowSeconds }, trace.next());
			},
			signal,
		);
	}
}

function selectScopeSource(state: PlayerStore): ScopeSource {
	return {
		isTracing: state.status === 'playing' && !state.isOverlayOpen,
		item: loadedItem(state),
		resolveArchive: state.urls?.archive,
	};
}
