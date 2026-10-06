import type { SonicButton } from '@xsynaptic/sonic-ui';

import type { LevelView } from '#elements/volume-level.ts';

import { buttonPart } from '#elements/button-part.ts';
import { muteLabel, selectLevel } from '#elements/volume-level.ts';
import { legendIcons, renderSonicButton } from '#lib/sonic-button.ts';

export const PlayerMuteButton = buttonPart(() => ({
	apply: (button: SonicButton, view: LevelView, labels) => {
		button.setAttribute('aria-label', muteLabel(view, labels));
		button.legend = view.icon;
	},
	press: (state) => {
		state.toggleMuted();
	},
	render: () =>
		renderSonicButton({
			icons: legendIcons(['volumeMuted', 'volumeLow', 'volumeMedium', 'volume']),
		}),
	select: selectLevel,
}));
