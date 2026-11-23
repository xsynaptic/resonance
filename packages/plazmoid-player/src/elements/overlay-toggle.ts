import type { PlayerStore } from '@xsynaptic/plazmoid-core';
import type { SonicButton } from '@xsynaptic/sonic-ui';

import { buttonPart } from '#elements/button-part.ts';
import { overlayBodyModule } from '#elements/overlay/overlay-module.ts';
import { playbackStore } from '#elements/player-context.ts';
import { bindPreload } from '#lib/bind-preload.ts';
import { cloneIcon } from '#lib/icons.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';

export const PlayerOverlayToggle = buttonPart(() => ({
	apply: (button: SonicButton, isEmpty: boolean) => {
		button.disabled = isEmpty;
	},
	// The press lands on the view store, which this button never reads, so it is bound here
	connect: (button, { store, view }, signal) => {
		bindPreload({ preload: overlayBodyModule.preload, store, trigger: button }, signal);
		button.addEventListener(
			'click',
			() => {
				view.getState().toggleOverlay();
			},
			{ signal },
		);
	},
	label: 'expand',
	render: () => {
		const button = renderSonicButton({
			className: 'pzm-overlay-toggle',
			icons: [cloneIcon('expand')],
		});

		button.setAttribute('popup', 'dialog');

		return button;
	},
	select: isQueueEmpty,
	store: playbackStore,
}));

function isQueueEmpty(state: PlayerStore): boolean {
	return state.queue.length === 0;
}
