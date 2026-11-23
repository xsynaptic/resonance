import type { PlayerStore } from '@xsynaptic/plazmoid-core';

import type { ViewStore } from '#view/view-store.ts';

import { bindPlayer } from '#elements/bind-player.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { dialogExit } from '#lib/dialog-exit.ts';
import { template } from '#lib/render.ts';

const renderDialog = template('<dialog class="pzm-overlay"></dialog>', HTMLDialogElement);

export class PlayerOverlay extends PlayerElement {
	readonly #dialog = renderDialog();

	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);
		const { labels, view } = context;
		const dialog = this.#dialog;

		const closeNow = (): void => {
			dialog.replaceChildren();
			if (dialog.open) dialog.close();
		};
		const exit = dialogExit(
			dialog,
			{
				onClosed: closeNow,
				onRequest: () => {
					view.getState().setOverlayOpen(false);
				},
			},
			signal,
		);
		const close = (): void => {
			exit.cancel();
			closeNow();
		};

		this.appendOnce(dialog);
		dialog.setAttribute('aria-label', labels.nowPlaying);
		signal.addEventListener('abort', close, { once: true });
		// The attribute rather than `close`, which Chrome skips when Escape closes the overlay after a nested sheet
		const openObserver = new MutationObserver(() => {
			if (!dialog.open) view.getState().setOverlayOpen(false);
		});

		openObserver.observe(dialog, { attributeFilter: ['open'] });
		signal.addEventListener(
			'abort',
			() => {
				openObserver.disconnect();
			},
			{ once: true },
		);
		bindPlayer(
			context,
			isOverlayShown,
			(isShown) => {
				if (!isShown) {
					exit.slide();
					return;
				}

				close();
				dialog.showModal();
				dialog.append(document.createElement('pzm-overlay-content'));
			},
			signal,
		);
	}
}

// A host may hide an empty bar, which would hide the modal and leave the page inert
function isOverlayShown(state: PlayerStore, view: ViewStore): boolean {
	return view.isOverlayOpen && state.queue.length > 0;
}
