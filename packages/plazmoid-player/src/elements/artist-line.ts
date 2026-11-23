import type { PlayerStore } from '@xsynaptic/plazmoid-core';
import type { SonicTicker } from '@xsynaptic/sonic-ui';

import { bind, displayedTrack } from '@xsynaptic/plazmoid-core';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { template } from '#lib/render.ts';

const renderLine = template('<span class="pzm-track-artist"></span>', HTMLSpanElement);

export class PlayerArtistLine extends PlayerElement {
	readonly #ticker = document.createElement('sonic-ticker');
	readonly #line = lineAround(this.#ticker);

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);

		this.#ticker.cancellable = true;
		this.appendOnce(this.#line);
		bind(
			store,
			selectArtistLine,
			(artistLine) => {
				this.hidden = artistLine === undefined;
				this.#ticker.text = artistLine;
			},
			signal,
		);
	}
}

function lineAround(ticker: SonicTicker): HTMLSpanElement {
	const line = renderLine();

	line.append(ticker);

	return line;
}

function selectArtistLine(state: PlayerStore): string | undefined {
	return displayedTrack(state)?.artistLine;
}
