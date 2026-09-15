import type { PlayerStore } from '#store/player-types.ts';

import { buttonPart } from '#elements/button-part.ts';
import { renderIconButton } from '#elements/icon-button.ts';

export const PlayerQueueButton = buttonPart({
	apply: (button, isOpen: boolean) => {
		button.setAttribute('aria-expanded', String(isOpen));
	},
	icon: 'queue',
	label: 'queue',
	press: (state) => {
		state.toggleTray();
	},
	render: () => renderIconButton(),
	select: isTrayOpen,
});

function isTrayOpen(state: PlayerStore): boolean {
	return state.isTrayOpen;
}
