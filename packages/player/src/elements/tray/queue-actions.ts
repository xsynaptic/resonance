import type { SonicButton } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bindButton } from '#lib/bind-button.ts';
import { template } from '#lib/render.ts';

interface ActionParts {
	actions: HTMLDivElement;
	clear: SonicButton;
	shuffle: SonicButton;
}

const renderActions = template('<div class="player-queue-actions"></div>', HTMLDivElement);

export class PlayerQueueActions extends PlayerElement {
	readonly #parts = renderActionParts();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const { actions, clear, shuffle } = this.#parts;

		writeLabel(shuffle, labels.shuffle);
		writeLabel(clear, labels.clearQueue);
		this.appendOnce(actions);
		bindButton(
			{
				apply: (isShuffling) => {
					shuffle.pressed = isShuffling;
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

function renderAction() {
	const button = document.createElement('sonic-button');

	button.className = 'player-button-pill player-tray-action';
	button.append(document.createElement('span'));

	return button;
}

function renderActionParts(): ActionParts {
	const actions = renderActions();
	const shuffle = renderAction();
	const clear = renderAction();

	shuffle.latching = true;
	actions.append(shuffle, clear);

	return { actions, clear, shuffle };
}

function writeLabel(button: SonicButton, label: string): void {
	const text = button.querySelector(':scope > span');

	if (text) text.textContent = label;
}
