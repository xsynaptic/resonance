import type { PlayerRoot } from '#elements/player-root.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { placeSeekButtons } from '#elements/seek-buttons.ts';
import { template } from '#lib/render.ts';

const renderBar = template(
	'<section class="player-bar"><player-panel></player-panel><div class="player-bar-grid"><player-artwork></player-artwork><div class="player-transport"><player-step-button direction="previous"></player-step-button><player-play-button></player-play-button><player-step-button direction="next"></player-step-button></div><div class="player-track"><player-title></player-title><div class="player-track-meta"><player-artist-line></player-artist-line><player-time></player-time></div></div><player-time-slider></player-time-slider><player-status></player-status><player-scope></player-scope><player-panel-toggle></player-panel-toggle><player-volume-popover></player-volume-popover><player-queue-button></player-queue-button><player-overlay-toggle></player-overlay-toggle></div><player-overlay></player-overlay></section>',
	HTMLElement,
);

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
	const [previous, next] = [...bar.querySelectorAll('player-step-button')];

	if (!root.isArtworkEnabled) bar.querySelector('player-artwork')?.remove();
	if (!root.isOverlayEnabled) {
		for (const part of bar.querySelectorAll('player-overlay, player-overlay-toggle')) part.remove();
	}
	if (previous && next && root.seekSeconds !== undefined) {
		placeSeekButtons(previous, next, root.seekSeconds);
	}
}
