import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { dialogExit } from '#lib/dialog-exit.ts';
import { template } from '#lib/render.ts';

const renderDialog = template('<dialog class="player-overlay"></dialog>', HTMLDialogElement);

export class PlayerOverlay extends PlayerElement {
	readonly #dialog = renderDialog();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
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
					store.getState().setOverlayOpen(false);
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
			if (!dialog.open) store.getState().setOverlayOpen(false);
		});

		openObserver.observe(dialog, { attributeFilter: ['open'] });
		signal.addEventListener(
			'abort',
			() => {
				openObserver.disconnect();
			},
			{ once: true },
		);
		bind(
			store,
			isOverlayShown,
			(isShown) => {
				if (!isShown) {
					exit.slide();
					return;
				}

				close();
				dialog.showModal();
				dialog.append(document.createElement('player-overlay-content'));
			},
			signal,
		);
	}
}

// A host may hide an empty bar, which would hide the modal and leave the page inert
function isOverlayShown(state: PlayerStore): boolean {
	return state.isOverlayOpen && state.queue.length > 0;
}
