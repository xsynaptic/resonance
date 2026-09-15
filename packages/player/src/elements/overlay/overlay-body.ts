import type { PlayerContext } from '#elements/player-context.ts';
import type { OverlayLayout } from '#lib/overlay-layout.ts';

import { cloneIcon } from '#elements/icons.ts';
import { bindSheets } from '#elements/overlay/overlay-sheets.ts';
import { bindTabs } from '#elements/overlay/overlay-tabs.ts';
import { PlayerTracklist } from '#elements/overlay/tracklist.ts';
import { placeSeekButtons } from '#elements/seek-buttons.ts';
import { isLeavingPage } from '#lib/leaving-page.ts';
import { layoutFor } from '#lib/overlay-layout.ts';
import { template } from '#lib/render.ts';

interface BodyParts {
	art: HTMLElement;
	body: HTMLDivElement;
	close: HTMLButtonElement;
	columnsOnly: Array<HTMLElement>;
	next: HTMLElement;
	previous: HTMLElement;
	sheets: HTMLElement;
	tabs: HTMLElement;
}

// The stylesheet's artwork caps for each layout, less the overlay's padding
const artworkSizes =
	'(width >= 40rem) and (height >= 30rem) min(40vw, 100vh - 2rem, 900px), min(100vw - 2rem, 60vh, 40rem)';

const renderBody = template(
	`<div class="player-overlay-body" data-layout="columns"><div class="player-overlay-layout"><div class="player-overlay-art"><player-artwork sizes="${artworkSizes}"></player-artwork></div><div class="player-overlay-deck"><div class="player-overlay-head"><button class="player-button player-button-icon player-overlay-close" type="button"></button><div class="player-track player-overlay-track"><player-title></player-title><div class="player-track-meta"><player-artist-line></player-artist-line><player-time></player-time></div></div></div><player-panel></player-panel><div class="player-overlay-scrub"><player-time-slider></player-time-slider><player-status></player-status></div><div class="player-overlay-controls"><div class="player-transport"><player-step-button direction="previous"></player-step-button><player-play-button></player-play-button><player-step-button direction="next"></player-step-button></div><player-panel-toggle></player-panel-toggle><player-volume-popover></player-volume-popover></div><div class="player-overlay-tabs"><div class="player-overlay-tablist" role="tablist"></div><div class="player-overlay-list" role="tabpanel"></div></div><div class="player-overlay-sheets" hidden><button aria-haspopup="dialog" class="player-button player-button-icon" type="button"></button><player-panel-toggle></player-panel-toggle><button aria-haspopup="dialog" class="player-button player-button-icon" type="button"></button><dialog class="player-overlay-sheet"><div class="player-overlay-sheet-header"><p class="player-overlay-sheet-title"></p><button class="player-button player-button-icon" type="button"></button></div><div class="player-overlay-list"></div></dialog></div></div></div></div>`,
	HTMLDivElement,
);

export function connectOverlayBody(
	host: HTMLElement,
	context: PlayerContext,
	signal: AbortSignal,
): void {
	if (!customElements.get('player-tracklist')) {
		customElements.define('player-tracklist', PlayerTracklist);
	}

	const { labels, root, store } = context;
	const parts = renderBodyParts();
	const closeSheet = bindSheets(parts.sheets, context, signal);

	if (!root.isArtworkEnabled) parts.art.remove();
	if (root.seekSeconds !== undefined)
		placeSeekButtons(parts.previous, parts.next, root.seekSeconds);

	parts.close.setAttribute('aria-label', labels.close);
	parts.close.append(cloneIcon('closeLarge'));
	parts.close.addEventListener(
		'click',
		() => {
			store.getState().setOverlayOpen(false);
		},
		{ signal },
	);
	parts.body.addEventListener(
		'click',
		(event) => {
			if (isLeavingPage(event)) store.getState().setOverlayOpen(false);
		},
		{ capture: true, signal },
	);
	bindTabs(parts.tabs, context, signal);
	host.append(parts.body);
	bindLayout(
		parts.body,
		(layout) => {
			parts.body.dataset.layout = layout;
			parts.tabs.hidden = layout !== 'columns';
			parts.sheets.hidden = layout === 'columns';
			for (const control of parts.columnsOnly) control.hidden = layout !== 'columns';
			if (layout === 'columns') closeSheet();
		},
		signal,
	);

	// A first open lands here after the dialog opened with nothing to focus; outside a dialog it takes no focus
	if (host.closest('dialog[open]')) parts.close.focus();
}

// Measured rather than queried in CSS, since a layout change has to close an open sheet
function bindLayout(
	body: HTMLElement,
	apply: (layout: OverlayLayout) => void,
	signal: AbortSignal,
): void {
	const measure = (): void => {
		const { height, width } = body.getBoundingClientRect();

		if (width === 0) return;

		apply(layoutFor(width, height));
	};
	const observer = new ResizeObserver(measure);

	observer.observe(body);
	signal.addEventListener(
		'abort',
		() => {
			observer.disconnect();
		},
		{ once: true },
	);
	measure();
}

function renderBodyParts(): BodyParts {
	const body = renderBody();
	const art = body.querySelector<HTMLElement>('.player-overlay-art');
	const close = body.querySelector<HTMLButtonElement>('.player-overlay-close');
	const [previous, next] = [...body.querySelectorAll('player-step-button')];
	const tabs = body.querySelector<HTMLElement>('.player-overlay-tabs');
	const sheets = body.querySelector<HTMLElement>('.player-overlay-sheets');
	const controls = body.querySelector('.player-overlay-controls');

	if (!art || !close || !previous || !next || !tabs || !sheets || !controls) {
		throw new Error('The overlay body template lost part of its markup');
	}

	const columnsOnly = [
		...controls.querySelectorAll<HTMLElement>(':scope > :not(.player-transport)'),
	];

	return { art, body, close, columnsOnly, next, previous, sheets, tabs };
}
