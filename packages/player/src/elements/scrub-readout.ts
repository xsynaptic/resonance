import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { formatClock } from '#lib/format.ts';
import { requireChild, template } from '#lib/render.ts';
import { loadedItem } from '#store/selectors.ts';
import { cueIndexAt } from '#waveform/cue-points.ts';

interface ReadoutView {
	clock: string;
	isTrack: boolean;
	meta: string;
	title: string;
}

const readoutAttributes = {
	isHeld: 'data-held',
	isTrack: 'data-track',
} as const;

const renderLayer = template(
	/* HTML */ `
		<div aria-hidden="true" class="player-scrub-readout">
			<span class="player-scrub-readout-title"></span><span class="player-scrub-readout-meta"></span
			><span class="player-scrub-readout-clock"></span>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerScrubReadout extends PlayerElement {
	readonly #layer = renderLayer();
	readonly #clock = requireChild(this.#layer, '.player-scrub-readout-clock', HTMLSpanElement);
	readonly #meta = requireChild(this.#layer, '.player-scrub-readout-meta', HTMLSpanElement);
	readonly #title = requireChild(this.#layer, '.player-scrub-readout-title', HTMLSpanElement);

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);

		this.appendOnce(this.#layer);
		bind(
			store,
			selectReadout,
			(view) => {
				this.#apply(view);
			},
			signal,
		);
	}

	// The text stays through a release, so the layer fades out on what it showed
	#apply(view: ReadoutView | undefined): void {
		this.toggleAttribute(readoutAttributes.isHeld, view !== undefined);

		if (view === undefined) return;

		this.toggleAttribute(readoutAttributes.isTrack, view.isTrack);
		this.#clock.textContent = view.clock;
		this.#meta.textContent = view.meta;
		this.#title.textContent = view.title;
	}
}

function selectReadout(state: PlayerStore): ReadoutView | undefined {
	const seconds = state.scrubPreviewSeconds;
	const item = loadedItem(state);
	if (seconds === undefined || item === undefined) return undefined;

	const cuePoints = item.cuePoints ?? [];
	const cuePoint = cuePoints[cueIndexAt(cuePoints, seconds)];
	const clock = formatClock(seconds);

	if (cuePoint === undefined) {
		return { clock, isTrack: false, meta: item.artistLine, title: item.title };
	}

	return { clock, isTrack: true, meta: cuePoint.artistLine, title: cuePoint.title };
}
