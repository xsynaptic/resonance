import type { ScopeSurface } from '#elements/scope/scope-surface.ts';
import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { scopeSurfaceModule } from '#elements/scope/scope-module.ts';
import { bind } from '#lib/bind.ts';
import { observeResize } from '#lib/observe-resize.ts';
import { requireChild, template } from '#lib/render.ts';

const renderScreen = template(
	'<div class="player-scope sonic-screen"><div class="player-scope-trace"></div><button aria-pressed="true" class="player-scope-toggle" type="button"></button></div>',
	HTMLDivElement,
);

export class PlayerScope extends PlayerElement {
	#isOn = true;

	readonly #screen = renderScreen();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const screen = this.#screen;
		const box = requireChild(screen, '.player-scope-trace', HTMLDivElement);
		const toggle = requireChild(screen, 'button', HTMLButtonElement);
		let isTracing = isPlayingInBar(store.getState());
		let surface: ScopeSurface | undefined;

		const open = async (): Promise<void> => {
			try {
				const connectScopeSurface = await scopeSurfaceModule.load();
				if (surface || signal.aborted) return;

				surface = connectScopeSurface(box, store, signal);
				retrace();
			} catch (error) {
				reportError(error);
			}
		};

		const retrace = (): void => {
			const shouldTrace = isTracing && this.#isOn;

			if (surface) {
				surface.trace(shouldTrace);

				return;
			}

			// A scope with no width is hidden by a container query, where the chunk would load for nothing
			if (!shouldTrace || box.clientWidth === 0) return;

			void open();
		};

		toggle.setAttribute('aria-label', labels.scope);
		this.appendOnce(screen);
		toggle.addEventListener(
			'click',
			() => {
				this.#isOn = !this.#isOn;
				toggle.setAttribute('aria-pressed', String(this.#isOn));
				if (this.#isOn) retrace();
			},
			{ signal },
		);
		box.addEventListener(
			'transitionend',
			() => {
				if (!this.#isOn) retrace();
			},
			{ signal },
		);
		observeResize(box, retrace, signal);
		bind(
			store,
			isPlayingInBar,
			(selected) => {
				isTracing = selected;
				retrace();
			},
			signal,
		);
	}
}

function isPlayingInBar(state: PlayerStore): boolean {
	return state.status === 'playing' && !state.isOverlayOpen;
}
