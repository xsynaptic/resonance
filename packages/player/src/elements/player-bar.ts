import type { PlayerContext } from '#elements/player-context.ts';

import { placeSeekButtons } from '#elements/place-seek-buttons.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { template } from '#lib/render.ts';

type BarOption = 'isArtworkEnabled' | 'isOverlayEnabled' | 'isPanelEnabled' | 'isScopeEnabled';

const renderBar = template(
	/* HTML */ `
		<section class="pzm-bar">
			<pzm-progress></pzm-progress><pzm-panel></pzm-panel>
			<div class="pzm-bar-grid">
				<pzm-artwork></pzm-artwork>
				<div class="pzm-transport">
					<pzm-step-button direction="previous"></pzm-step-button><pzm-play-button></pzm-play-button
					><pzm-step-button direction="next"></pzm-step-button>
				</div>
				<div class="pzm-track">
					<pzm-title></pzm-title>
					<div class="pzm-track-meta"><pzm-artist-line></pzm-artist-line><pzm-time></pzm-time></div>
					<pzm-scrub-readout></pzm-scrub-readout>
				</div>
				<pzm-time-slider></pzm-time-slider><pzm-status></pzm-status><pzm-scope></pzm-scope
				><pzm-panel-toggle></pzm-panel-toggle><pzm-volume></pzm-volume
				><pzm-queue-button></pzm-queue-button><pzm-overlay-toggle></pzm-overlay-toggle>
			</div>
			<pzm-overlay></pzm-overlay>
		</section>
	`,
	HTMLElement,
);

const optionalParts: ReadonlyArray<[option: BarOption, selector: string]> = [
	['isArtworkEnabled', 'pzm-artwork'],
	['isOverlayEnabled', 'pzm-overlay, pzm-overlay-toggle'],
	['isPanelEnabled', 'pzm-panel, pzm-panel-toggle'],
	['isScopeEnabled', 'pzm-scope'],
];

// The root's options shape the bar once, as it is first placed, so a host sets them before the bar connects
export class PlayerBar extends PlayerElement {
	readonly #bar = renderBar();

	protected connect(): void {
		const bar = this.#bar;
		if (bar.parentNode === this) return;

		const context = playerContext(this);

		bar.setAttribute('aria-label', context.labels.nowPlaying);
		shapeBar(bar, context);
		this.append(bar);
	}
}

function shapeBar(bar: HTMLElement, { root, store }: PlayerContext): void {
	for (const [option, selector] of optionalParts) {
		if (root[option]) continue;

		for (const part of bar.querySelectorAll(selector)) part.remove();
	}

	const [previous, next] = [...bar.querySelectorAll('pzm-step-button')];

	if (previous && next) placeSeekButtons(previous, next, store.getState().seekSeconds);
}
