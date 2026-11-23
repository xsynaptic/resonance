import type { PlayerStore } from '@xsynaptic/plazmoid-core';

import type { ScopeSurface } from '#elements/scope/scope-surface.ts';
import type { ViewStore } from '#view/view-store.ts';

import { bindPlayer } from '#elements/bind-player.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { scopeSurfaceModule } from '#elements/scope/scope-module.ts';
import { observeResize } from '#lib/observe-resize.ts';
import { requireChild, template } from '#lib/render.ts';

const renderScreen = template(
	'<div class="pzm-scope sonic-screen"><div class="pzm-scope-trace"></div><button aria-pressed="true" class="pzm-scope-toggle" type="button"></button></div>',
	HTMLDivElement,
);

export class PlayerScope extends PlayerElement {
	#isOn = true;

	readonly #screen = renderScreen();

	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);
		const { labels, store, view } = context;
		const screen = this.#screen;
		const box = requireChild(screen, '.pzm-scope-trace', HTMLDivElement);
		const toggle = requireChild(screen, 'button', HTMLButtonElement);
		let isTracing = isPlayingInBar(store.getState(), view.getState());
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
		bindPlayer(
			context,
			isPlayingInBar,
			(selected) => {
				isTracing = selected;
				retrace();
			},
			signal,
		);
	}
}

function isPlayingInBar(state: PlayerStore, view: ViewStore): boolean {
	return state.status === 'playing' && !view.isOverlayOpen;
}
