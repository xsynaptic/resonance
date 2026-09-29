import { formatPercent, parsePercent, SonicDial } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { canSetVolume } from '#lib/can-set-volume.ts';
import { requireChild, template } from '#lib/render.ts';

const renderControl = template(
	/* HTML */ `
		<div class="player-volume">
			<player-mute-button></player-mute-button><sonic-dial max="1" readout step="0.01"></sonic-dial>
		</div>
	`,
	HTMLDivElement,
);

function selectDial({ isMuted, volume }: PlayerStore) {
	return { isMuted, volume };
}

export class PlayerVolume extends PlayerElement {
	readonly #control = renderControl();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const control = this.#control;

		// The cloned dial upgrades on connect, so query it only after appending
		this.appendOnce(control);

		const dial = requireChild(control, 'sonic-dial', SonicDial);

		dial.hidden = !canSetVolume();
		dial.setAttribute('aria-label', labels.volume);
		dial.formatValue = formatPercent;
		dial.parseValue = parsePercent;
		dial.addEventListener(
			'input',
			() => {
				store.getState().setVolume(dial.value);
			},
			{ signal },
		);
		bind(
			store,
			selectDial,
			({ isMuted, volume }) => {
				dial.value = volume;
				dial.dimmed = isMuted;
			},
			signal,
		);
	}
}
