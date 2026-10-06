import type { SonicButton } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';

import { buttonPart } from '#elements/button-part.ts';
import { panelSurfaceModule } from '#elements/panel/panel-module.ts';
import { bindPreload } from '#lib/bind-preload.ts';
import { cloneIcon } from '#lib/icons.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';
import { isLoaded } from '#store/selectors.ts';

interface PanelToggleView {
	isDisabled: boolean;
	isOpen: boolean;
}

export const PlayerPanelToggle = buttonPart(() => ({
	apply: (button: SonicButton, view: PanelToggleView) => {
		button.disabled = view.isDisabled;
		button.pressed = view.isOpen;
	},
	connect: (button, { store }, signal) => {
		bindPreload({ preload: panelSurfaceModule.preload, store, trigger: button }, signal);
	},
	label: 'waveformPanel',
	press: (state) => {
		state.togglePanel();
	},
	render: () => {
		const button = renderSonicButton({
			className: 'player-panel-toggle',
			icons: [cloneIcon('waveform')],
		});

		button.latching = true;

		return button;
	},
	select: selectPanelToggle,
}));

function selectPanelToggle(state: PlayerStore): PanelToggleView {
	return { isDisabled: !isLoaded(state), isOpen: state.isPanelOpen };
}
