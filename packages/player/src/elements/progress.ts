import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { template } from '#lib/render.ts';
import { isLoaded } from '#store/selectors.ts';

const renderLine = template(
	'<div aria-hidden="true" class="player-progress"></div>',
	HTMLDivElement,
);

export class PlayerProgress extends PlayerElement {
	readonly #line = renderLine();

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);
		const line = this.#line;

		this.appendOnce(line);
		bind(
			store,
			playedShare,
			(share) => {
				line.style.setProperty('--player-progress', String(share));
			},
			signal,
		);
	}
}

function playedShare(state: PlayerStore): number {
	if (!isLoaded(state) || !state.durationSeconds) return 0;

	return Math.min(state.currentTimeSeconds / state.durationSeconds, 1);
}
