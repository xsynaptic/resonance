import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bindButton } from '#lib/bind-button.ts';
import { requireChildren, template } from '#lib/render.ts';

const renderActions = template(
	/* HTML */ `
		<div class="player-queue-actions">
			<button class="player-tray-action" type="button"></button
			><button class="player-tray-action" type="button"></button>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerQueueActions extends PlayerElement {
	readonly #actions = renderActions();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const [shuffle, clear] = requireChildren(this.#actions, 'button', 2, HTMLButtonElement);

		this.appendOnce(this.#actions);
		shuffle.textContent = labels.shuffle;
		clear.textContent = labels.clearQueue;
		bindButton(
			{
				apply: (isShuffling) => {
					shuffle.setAttribute('aria-pressed', String(isShuffling));
				},
				button: shuffle,
				press: (state) => {
					state.toggleShuffle();
				},
				select: isShuffling,
				store,
			},
			signal,
		);
		clear.addEventListener(
			'click',
			() => {
				store.getState().clearQueue();
			},
			{ signal },
		);
	}
}

function isShuffling(state: PlayerStore): boolean {
	return state.isShuffling;
}
