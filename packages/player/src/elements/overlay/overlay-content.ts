import type { PlayerContext } from '#elements/player-context.ts';

import { overlayBodyModule } from '#elements/overlay/overlay-module.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';

export class PlayerOverlayContent extends PlayerElement {
	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);

		this.replaceChildren();
		void openBody(this, context, signal);
	}
}

async function openBody(
	host: HTMLElement,
	context: PlayerContext,
	signal: AbortSignal,
): Promise<void> {
	try {
		const connectOverlayBody = await overlayBodyModule.load();

		if (!signal.aborted) connectOverlayBody(host, context, signal);
	} catch (error) {
		context.store.getState().setOverlayOpen(false);
		reportError(error);
	}
}
