import { bind } from '@xsynaptic/plazmoid-core';

import type { PlayerContext } from '#elements/player-context.ts';
import type { ViewStore } from '#view/view-store.ts';

import { panelSurfaceModule } from '#elements/panel/panel-module.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { template } from '#lib/render.ts';
import { supersede } from '#lib/supersede.ts';

const renderPanel = template('<div aria-hidden="true" class="pzm-panel"></div>', HTMLDivElement);

export class PlayerPanel extends PlayerElement {
	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);
		const isShown = this.closest('pzm-overlay-content') === null ? isShownInBar : isPanelOpen;
		const opened = supersede(signal);

		const close = (): void => {
			opened.cancel();
			this.replaceChildren();
		};

		signal.addEventListener('abort', close, { once: true });
		bind(
			context.view,
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

function isPanelOpen(view: ViewStore): boolean {
	return view.isPanelOpen;
}

function isShownInBar(view: ViewStore): boolean {
	return view.isPanelOpen && !view.isOverlayOpen;
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
		context.view.getState().setPanelOpen(false);
		reportError(error);
	}
}
