import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';

import { panelSurfaceModule } from '#elements/panel/panel-module.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { template } from '#lib/render.ts';
import { supersede } from '#lib/supersede.ts';

// Holds the bar's height while the surface loads, and stays hidden from assistive tech until it names itself
const renderPanel = template('<div aria-hidden="true" class="player-panel"></div>', HTMLDivElement);

export class PlayerPanel extends PlayerElement {
	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);
		const isShown = this.closest('player-overlay-content') === null ? isShownInBar : isPanelOpen;
		const opened = supersede(signal);

		const close = (): void => {
			opened.cancel();
			this.replaceChildren();
		};

		signal.addEventListener('abort', close, { once: true });
		bind(
			context.store,
			isShown,
			(isOpen) => {
				close();
				if (!isOpen) return;

				const panel = renderPanel();

				this.append(panel);
				void openSurface(panel, context, opened.next());
			},
			signal,
		);
	}
}

function isPanelOpen(state: PlayerStore): boolean {
	return state.isPanelOpen;
}

function isShownInBar(state: PlayerStore): boolean {
	return state.isPanelOpen && !state.isOverlayOpen;
}

async function openSurface(
	panel: HTMLElement,
	context: PlayerContext,
	signal: AbortSignal,
): Promise<void> {
	try {
		const connectPanelSurface = await panelSurfaceModule.load();

		if (!signal.aborted) connectPanelSurface(panel, context, signal);
	} catch (error) {
		context.store.getState().setPanelOpen(false);
		reportError(error);
	}
}
