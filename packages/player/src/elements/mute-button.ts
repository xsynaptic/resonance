import type { LevelView } from '#elements/volume-level.ts';

import { buttonPart } from '#elements/button-part.ts';
import { muteLabel, selectLevel } from '#elements/volume-level.ts';
import { renderIconButton } from '#lib/icon-button.ts';
import { cloneIcon } from '#lib/icons.ts';

export const PlayerMuteButton = buttonPart(() => ({
	apply: (button, view: LevelView, labels) => {
		button.setAttribute('aria-label', muteLabel(view, labels));
		button.replaceChildren(cloneIcon(view.icon));
	},
	press: (state) => {
		state.toggleMuted();
	},
	render: () => renderIconButton(),
	select: selectLevel,
}));
