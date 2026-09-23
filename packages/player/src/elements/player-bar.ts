import type { PlayerRoot } from '#elements/player-root.ts';

import { placeSeekButtons } from '#elements/place-seek-buttons.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { template } from '#lib/render.ts';

type BarOption = 'isArtworkEnabled' | 'isOverlayEnabled' | 'isPanelEnabled' | 'isScopeEnabled';

const renderBar = template(
	/* HTML */ `
		<section class="player-bar">
			<player-progress></player-progress><player-panel></player-panel>
			<div class="player-bar-grid">
				<player-artwork></player-artwork>
				<div class="player-transport">
					<player-step-button direction="previous"></player-step-button
					><player-play-button></player-play-button
					><player-step-button direction="next"></player-step-button>
				</div>
				<div class="player-track">
					<player-title></player-title>
					<div class="player-track-meta">
						<player-artist-line></player-artist-line><player-time></player-time>
					</div>
				</div>
				<player-time-slider></player-time-slider><player-status></player-status
				><player-scope></player-scope><player-panel-toggle></player-panel-toggle
				><player-volume-popover></player-volume-popover><player-queue-button></player-queue-button
				><player-overlay-toggle></player-overlay-toggle>
			</div>
			<player-overlay></player-overlay>
		</section>
	`,
	HTMLElement,
);

const optionalParts: ReadonlyArray<[option: BarOption, selector: string]> = [
	['isArtworkEnabled', 'player-artwork'],
	['isOverlayEnabled', 'player-overlay, player-overlay-toggle'],
	['isPanelEnabled', 'player-panel, player-panel-toggle'],
	['isScopeEnabled', 'player-scope'],
];

// The root's options shape the bar once, as it is first placed, so a host sets them before the bar connects
export class PlayerBar extends PlayerElement {
	readonly #bar = renderBar();

	protected connect(): void {
		const bar = this.#bar;
		if (bar.parentNode === this) return;

		const { labels, root } = playerContext(this);

		bar.setAttribute('aria-label', labels.nowPlaying);
		shapeBar(bar, root);
		this.append(bar);
	}
}

function shapeBar(bar: HTMLElement, root: PlayerRoot): void {
	for (const [option, selector] of optionalParts) {
		if (root[option]) continue;

		for (const part of bar.querySelectorAll(selector)) part.remove();
	}

	const [previous, next] = [...bar.querySelectorAll('player-step-button')];

	if (previous && next && root.seekSeconds !== undefined) {
		placeSeekButtons(previous, next, root.seekSeconds);
	}
}
