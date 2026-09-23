import type { PlayerStore } from '#store/player-types.ts';

import { buttonPart } from '#elements/button-part.ts';
import { panelSurfaceModule } from '#elements/panel/panel-module.ts';
import { bindPreload } from '#lib/bind-preload.ts';
import { renderIconButton } from '#lib/icon-button.ts';
import { isLoaded } from '#store/selectors.ts';

interface PanelToggleView {
	isDisabled: boolean;
	isOpen: boolean;
}

export const PlayerPanelToggle = buttonPart(() => ({
	apply: (button, view: PanelToggleView) => {
		button.disabled = view.isDisabled;
		button.setAttribute('aria-pressed', String(view.isOpen));
	},
	connect: (button, { store }, signal) => {
		bindPreload({ preload: panelSurfaceModule.preload, store, trigger: button }, signal);
	},
	icon: 'waveform',
	label: 'waveformPanel',
	press: (state) => {
		state.togglePanel();
	},
	render: () => renderIconButton('player-panel-toggle'),
	select: selectPanelToggle,
}));

function selectPanelToggle(state: PlayerStore): PanelToggleView {
	return { isDisabled: !isLoaded(state), isOpen: state.isPanelOpen };
}
