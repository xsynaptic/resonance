import type { PlayerStore } from '#store/player-types.ts';
import type { QueueArchive } from '#types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { traceArchive } from '#elements/scope/scope-archive.ts';
import { bind } from '#lib/bind.ts';
import { requireChild, template } from '#lib/render.ts';
import { supersede } from '#lib/supersede.ts';
import { loadedDetail } from '#store/selectors.ts';

// Wider and a kick is a few pixels; narrower and the archive's 256-sample pairs show as facets
const windowSeconds = 1;

const renderScreen = template(
	'<button aria-pressed="true" class="player-scope sonic-screen" type="button"><canvas class="player-scope-trace"></canvas></button>',
	HTMLButtonElement,
);

interface ScopeSource {
	archive: QueueArchive | undefined;
	isTracing: boolean;
}

export class PlayerScope extends PlayerElement {
	#isOn = true;

	readonly #screen = renderScreen();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const screen = this.#screen;
		const canvas = requireChild(screen, 'canvas', HTMLCanvasElement);
		const trace = supersede(signal);
		let source = selectScopeSource(store.getState());

		const retrace = (): void => {
			trace.cancel();
			if (!source.isTracing || !this.#isOn) return;

			traceArchive(canvas, { archive: source.archive, store, windowSeconds }, trace.next());
		};

		screen.setAttribute('aria-label', labels.scope);
		this.appendOnce(screen);
		screen.addEventListener(
			'click',
			() => {
				this.#isOn = !this.#isOn;
				screen.setAttribute('aria-pressed', String(this.#isOn));
				if (this.#isOn) retrace();
			},
			{ signal },
		);
		canvas.addEventListener(
			'transitionend',
			() => {
				if (!this.#isOn) retrace();
			},
			{ signal },
		);
		bind(
			store,
			selectScopeSource,
			(selected) => {
				source = selected;
				retrace();
			},
			signal,
		);
	}
}

function selectScopeSource(state: PlayerStore): ScopeSource {
	return {
		archive: loadedDetail(state)?.archive,
		isTracing: state.status === 'playing' && !state.isOverlayOpen,
	};
}
