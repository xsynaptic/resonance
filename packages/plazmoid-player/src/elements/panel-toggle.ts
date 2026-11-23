import type { SonicButton } from '@xsynaptic/sonic-ui';

import { bind, isLoaded } from '@xsynaptic/plazmoid-core';

import type { ViewStore } from '#view/view-store.ts';

import { buttonPart } from '#elements/button-part.ts';
import { panelSurfaceModule } from '#elements/panel/panel-module.ts';
import { viewStore } from '#elements/player-context.ts';
import { bindPreload } from '#lib/bind-preload.ts';
import { cloneIcon } from '#lib/icons.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';

export const PlayerPanelToggle = buttonPart(() => ({
	apply: (button: SonicButton, isOpen: boolean) => {
		button.pressed = isOpen;
	},
	connect: (button, { store }, signal) => {
		bind(
			store,
			isLoaded,
			(isTrackLoaded) => {
				button.disabled = !isTrackLoaded;
			},
			signal,
		);
		bindPreload({ preload: panelSurfaceModule.preload, store, trigger: button }, signal);
	},
	label: 'waveformPanel',
	press: (view) => {
		view.togglePanel();
	},
	render: () => {
		const button = renderSonicButton({
			className: 'pzm-panel-toggle',
			icons: [cloneIcon('waveform')],
		});

		button.latching = true;

		return button;
	},
	select: isPanelOpen,
	store: viewStore,
}));

function isPanelOpen(view: ViewStore): boolean {
	return view.isPanelOpen;
}
