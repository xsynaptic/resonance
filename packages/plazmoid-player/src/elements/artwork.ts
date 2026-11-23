import type { PlayerStore, TrackArtwork } from '@xsynaptic/plazmoid-core';

import { bind, displayedTrack } from '@xsynaptic/plazmoid-core';

import { barArtworkSize } from '#constants.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { template } from '#lib/render.ts';

const barSize = String(barArtworkSize);

const renderImage = template(
	`<img alt="" class="pzm-artwork" decoding="async" height="${barSize}" loading="lazy" width="${barSize}">`,
	HTMLImageElement,
);

export class PlayerArtwork extends PlayerElement {
	// A queue restored from storage can hold URLs a later deploy removed
	#failedSrc: string | undefined;

	readonly #image = renderImage();

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);
		const image = this.#image;

		image.sizes = this.getAttribute('sizes') ?? `${barSize}px`;
		image.addEventListener(
			'error',
			() => {
				this.#failedSrc = image.getAttribute('src') ?? undefined;
				this.#apply(selectArtwork(store.getState()));
			},
			{ signal },
		);
		bind(
			store,
			selectArtwork,
			(artwork) => {
				this.#apply(artwork);
			},
			signal,
		);
	}

	#apply(artwork: ReadonlyArray<TrackArtwork> | undefined): void {
		const first = artwork?.[0];

		if (!artwork || !first || first.src === this.#failedSrc) {
			this.#image.remove();
			return;
		}

		this.#image.srcset = artwork.map(({ src, width }) => `${src} ${String(width)}w`).join(', ');
		this.#image.src = first.src;
		this.appendOnce(this.#image);
	}
}

function selectArtwork(state: PlayerStore): ReadonlyArray<TrackArtwork> | undefined {
	return displayedTrack(state)?.artwork;
}
