import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { formatModeClock } from '#lib/format.ts';
import { requireChild, template } from '#lib/render.ts';
import { cueIndexAt } from '#queue/cue-points.ts';
import { loadedDetail, loadedTrack } from '#store/selectors.ts';

interface ReadoutView {
	clock: string;
	isCue: boolean;
	meta: string;
	title: string;
}

const readoutAttributes = {
	isCue: 'data-cue',
	isHeld: 'data-held',
} as const;

const renderLayer = template(
	/* HTML */ `
		<div aria-hidden="true" class="pzm-scrub-readout">
			<span class="pzm-scrub-readout-title"></span><span class="pzm-scrub-readout-meta"></span
			><span class="pzm-scrub-readout-clock"></span>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerScrubReadout extends PlayerElement {
	readonly #layer = renderLayer();
	readonly #clock = requireChild(this.#layer, '.pzm-scrub-readout-clock', HTMLSpanElement);
	readonly #meta = requireChild(this.#layer, '.pzm-scrub-readout-meta', HTMLSpanElement);
	readonly #title = requireChild(this.#layer, '.pzm-scrub-readout-title', HTMLSpanElement);

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

		this.toggleAttribute(readoutAttributes.isCue, view.isCue);
		this.#clock.textContent = view.clock;
		this.#meta.textContent = view.meta;
		this.#title.textContent = view.title;
	}
}

function selectReadout(state: PlayerStore): ReadoutView | undefined {
	const seconds = state.scrubPreviewSeconds;
	const track = loadedTrack(state);
	if (seconds === undefined || track === undefined) return undefined;

	const cuePoints = loadedDetail(state)?.cuePoints ?? [];
	const cuePoint = cuePoints[cueIndexAt(cuePoints, seconds)];
	const clock = formatModeClock(seconds, state);

	if (cuePoint === undefined) {
		return { clock, isCue: false, meta: track.artistLine, title: track.title };
	}

	return { clock, isCue: true, meta: cuePoint.artistLine, title: cuePoint.title };
}
