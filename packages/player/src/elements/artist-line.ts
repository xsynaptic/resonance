import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { bindMarquee, renderMarquee, writeMarquee } from '#lib/marquee.ts';
import { displayedItem } from '#store/selectors.ts';

export class PlayerArtistLine extends PlayerElement {
	readonly #marquee = renderMarquee();

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);
		const { box } = this.#marquee;

		box.classList.add('player-track-artist');
		this.appendOnce(box);
		bindMarquee(this.#marquee, signal);
		bind(
			store,
			selectArtistLine,
			(artistLine) => {
				this.hidden = artistLine === undefined;
				writeMarquee(this.#marquee, artistLine ?? '');
			},
			signal,
		);
	}
}

function selectArtistLine(state: PlayerStore): string | undefined {
	return displayedItem(state)?.artistLine;
}
