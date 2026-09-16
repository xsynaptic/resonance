import type { OverlayLayout } from '#elements/overlay/overlay-layout.ts';
import type { PlayerContext } from '#elements/player-context.ts';

import { defineOnce } from '#elements/define-once.ts';
import { isLeavingPage } from '#elements/overlay/leaving-page.ts';
import { bindOverlayGrab } from '#elements/overlay/overlay-grab.ts';
import { layoutFor } from '#elements/overlay/overlay-layout.ts';
import { bindSheets } from '#elements/overlay/overlay-sheets.ts';
import { bindTabs } from '#elements/overlay/overlay-tabs.ts';
import { PlayerTracklist } from '#elements/overlay/tracklist.ts';
import { cloneIcon } from '#lib/icons.ts';
import { observeResize } from '#lib/observe-resize.ts';
import { placeSeekButtons } from '#lib/place-seek-buttons.ts';
import { requireChild, template } from '#lib/render.ts';

interface BodyParts {
	art: HTMLElement;
	body: HTMLDivElement;
	close: HTMLButtonElement;
	columnsOnly: Array<HTMLElement>;
	head: HTMLElement;
	next: HTMLElement;
	previous: HTMLElement;
	sheets: HTMLElement;
	tabs: HTMLElement;
}

// The stylesheet's artwork caps for each layout; the phone cover is full bleed, so it takes no padding off
const artworkSizes =
	'(width >= 40rem) and (height >= 30rem) min(40vw, 100vh - 2rem, 900px), min(100vw, 60vh, 40rem)';

const renderBody = template(
	`<div class="player-overlay-body" data-layout="columns"><div aria-hidden="true" class="player-overlay-grabber"></div><div class="player-overlay-layout"><div class="player-overlay-art"><player-artwork sizes="${artworkSizes}"></player-artwork></div><div class="player-overlay-deck"><div class="player-overlay-head"><button class="player-button player-button-icon player-overlay-close" type="button"></button><div class="player-track player-overlay-track"><player-title></player-title><div class="player-track-meta"><player-artist-line></player-artist-line><player-time></player-time></div></div></div><player-panel></player-panel><div class="player-overlay-scrub"><player-time-slider></player-time-slider><player-status></player-status></div><div class="player-overlay-controls"><div class="player-transport"><player-step-button direction="previous"></player-step-button><player-play-button></player-play-button><player-step-button direction="next"></player-step-button></div><player-panel-toggle></player-panel-toggle><player-volume-popover></player-volume-popover></div><div class="player-overlay-tabs"><div class="player-overlay-tablist" role="tablist"></div><div class="player-overlay-list" role="tabpanel"></div></div><div class="player-overlay-sheets" hidden><button aria-haspopup="dialog" class="player-button player-button-icon" type="button"></button><player-panel-toggle></player-panel-toggle><dialog class="player-overlay-sheet"><div class="player-overlay-sheet-header"><button class="player-button player-button-icon player-overlay-close" type="button"></button></div></dialog></div></div></div></div>`,
	HTMLDivElement,
);

export function connectOverlayBody(
	host: HTMLElement,
	context: PlayerContext,
	signal: AbortSignal,
): void {
	defineOnce('player-tracklist', PlayerTracklist);

	const { labels, root, store } = context;
	const parts = renderBodyParts();
	const sheet = bindSheets(parts.sheets, context, signal);

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
	bindOverlayGrab(
		{
			body: parts.body,
			onDismiss: () => {
				store.getState().setOverlayOpen(false);
			},
		},
		signal,
	);
	bindLayout(
		parts.body,
		(layout) => {
			parts.body.dataset.layout = layout;
			parts.sheets.hidden = layout === 'columns';
			for (const control of parts.columnsOnly) control.hidden = layout !== 'columns';

			if (layout === 'phone') {
				parts.body.prepend(parts.close);
				sheet.dialog.append(parts.tabs);
				return;
			}

			sheet.closeSheet();
			parts.head.prepend(parts.close);
			parts.sheets.before(parts.tabs);
		},
		signal,
	);

	// A first open lands here after the dialog opened with nothing to focus; outside a dialog it takes no focus
	if (host.closest('dialog[open]')) parts.close.focus();
}

// Measured rather than queried in CSS, since a layout change moves the tabs and has to close an open sheet
function bindLayout(
	body: HTMLElement,
	apply: (layout: OverlayLayout) => void,
	signal: AbortSignal,
): void {
	let applied: OverlayLayout | undefined;

	const measure = (): void => {
		const { height, width } = body.getBoundingClientRect();

		if (width === 0) return;

		const layout = layoutFor(width, height);
		// Re-placing the tabs would blur whatever holds focus and drop the list's scroll position
		if (layout === applied) return;

		applied = layout;
		apply(layout);
	};
	observeResize(body, measure, signal);
	measure();
}

function renderBodyParts(): BodyParts {
	const body = renderBody();
	const art = requireChild(body, '.player-overlay-art', HTMLElement);
	const close = requireChild(body, '.player-overlay-close', HTMLButtonElement);
	const controls = requireChild(body, '.player-overlay-controls', HTMLElement);
	const head = requireChild(body, '.player-overlay-head', HTMLElement);
	const sheets = requireChild(body, '.player-overlay-sheets', HTMLElement);
	const tabs = requireChild(body, '.player-overlay-tabs', HTMLElement);
	const [previous, next] = [...body.querySelectorAll('player-step-button')];

	if (!previous || !next) {
		throw new Error('The overlay body template lost its step buttons');
	}

	const columnsOnly = [
		...controls.querySelectorAll<HTMLElement>(':scope > :not(.player-transport)'),
	];

	return { art, body, close, columnsOnly, head, next, previous, sheets, tabs };
}
