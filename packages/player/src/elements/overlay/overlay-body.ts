import type { PlayerContext } from '#elements/player-context.ts';

import { defineOnce } from '#elements/define-once.ts';
import { bindOverlayGrab } from '#elements/overlay/overlay-grab.ts';
import { bindSheets } from '#elements/overlay/overlay-sheets.ts';
import { bindTabs } from '#elements/overlay/overlay-tabs.ts';
import { PlayerTracklist } from '#elements/overlay/tracklist.ts';
import { placeSeekButtons } from '#elements/place-seek-buttons.ts';
import { cloneIcon } from '#lib/icons.ts';
import { observeResize } from '#lib/observe-resize.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { requireChild, requireChildren, template } from '#lib/render.ts';

interface BodyParts {
	art: HTMLElement;
	body: HTMLDivElement;
	close: HTMLButtonElement;
	columnsOnly: Array<HTMLElement>;
	head: HTMLElement;
	header: HTMLElement;
	next: HTMLElement;
	previous: HTMLElement;
	sheets: HTMLElement;
	tabs: HTMLElement;
}

type LinkClick = Pick<
	MouseEvent,
	'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'
>;

type OverlayLayout = 'columns' | 'phone';

// Rem, so the switch follows the reader's font size as a media query would
const columnsMinWidthRem = 40;
const columnsMinHeightRem = 30;

// The stylesheet's artwork caps for each layout; the phone cover is full bleed, so it takes no padding off
const artworkSizes =
	'(width >= 40rem) and (height >= 30rem) min(40vw, 100vh - 2rem, 900px), (orientation: landscape) min(50vw, 100vh, 900px), min(100vw, 60vh, 40rem)';

const renderBody = template(
	/* HTML */ `
		<div class="player-overlay-body" data-layout="columns">
			<div class="player-overlay-layout">
				<div class="player-overlay-art">
					<player-artwork sizes="${artworkSizes}"></player-artwork>
				</div>
				<div class="player-overlay-deck">
					<div class="player-overlay-head">
						<button
							class="player-button player-button-icon player-overlay-close"
							type="button"
						></button>
						<div class="player-track player-overlay-track">
							<player-title></player-title>
							<div class="player-track-meta">
								<player-artist-line></player-artist-line><player-time></player-time>
							</div>
						</div>
					</div>
					<player-panel></player-panel>
					<div class="player-overlay-scrub">
						<player-time-slider></player-time-slider><player-status></player-status>
					</div>
					<div class="player-overlay-controls">
						<div class="player-transport">
							<player-step-button direction="previous"></player-step-button
							><player-play-button></player-play-button
							><player-step-button direction="next"></player-step-button>
						</div>
						<player-panel-toggle></player-panel-toggle
						><player-volume-popover></player-volume-popover>
					</div>
					<div class="player-overlay-tabs">
						<div class="player-header">
							<div class="player-overlay-tablist" role="tablist"></div>
							<player-queue-actions></player-queue-actions>
						</div>
						<div class="player-overlay-list" role="tabpanel"></div>
					</div>
					<div class="player-overlay-sheets" hidden>
						<button
							aria-haspopup="dialog"
							class="player-button player-button-icon"
							type="button"
						></button
						><player-panel-toggle></player-panel-toggle>
						<dialog class="player-overlay-sheet" tabindex="-1">
							<button
								class="player-button player-button-icon player-overlay-close"
								type="button"
							></button>
						</dialog>
					</div>
				</div>
			</div>
		</div>
	`,
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
	if (!root.isPanelEnabled) {
		for (const part of parts.body.querySelectorAll('player-panel, player-panel-toggle'))
			part.remove();
	}
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
	if (root.isArtworkEnabled) {
		bindOverlayGrab(
			{
				onDismiss: () => {
					store.getState().setOverlayOpen(false);
				},
				region: parts.art,
				sheet: parts.body.closest('dialog') ?? parts.body,
			},
			signal,
		);
	}
	bindOverlayGrab(
		{ onDismiss: sheet.closeSheet, region: parts.header, sheet: sheet.dialog },
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
				parts.header.append(sheet.close);
				return;
			}

			sheet.closeSheetNow();
			sheet.dialog.append(sheet.close);
			parts.head.prepend(parts.close);
			parts.sheets.before(parts.tabs);
		},
		signal,
	);
}

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

		if (layout === applied) return;

		applied = layout;
		apply(layout);
	};
	observeResize(body, measure, signal);
	measure();
}

function isLeavingPage(event: LinkClick): boolean {
	if (isModifiedClick(event)) return false;

	const link = event.target instanceof Element ? event.target.closest('a[href]') : undefined;
	if (!(link instanceof HTMLAnchorElement)) return false;

	return (link.target === '' || link.target === '_self') && !link.hasAttribute('download');
}

function isModifiedClick(event: LinkClick): boolean {
	return event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function layoutFor(width: number, height: number): OverlayLayout {
	const remPixels = readPxProperty(getComputedStyle(document.documentElement), 'font-size', 16);

	return width >= columnsMinWidthRem * remPixels && height >= columnsMinHeightRem * remPixels
		? 'columns'
		: 'phone';
}

function renderBodyParts(): BodyParts {
	const body = renderBody();
	const art = requireChild(body, '.player-overlay-art', HTMLElement);
	const close = requireChild(body, '.player-overlay-close', HTMLButtonElement);
	const controls = requireChild(body, '.player-overlay-controls', HTMLElement);
	const head = requireChild(body, '.player-overlay-head', HTMLElement);
	const header = requireChild(body, '.player-header', HTMLElement);
	const sheets = requireChild(body, '.player-overlay-sheets', HTMLElement);
	const tabs = requireChild(body, '.player-overlay-tabs', HTMLElement);
	const [previous, next] = requireChildren(body, 'player-step-button', 2, HTMLElement);

	const columnsOnly = [
		...controls.querySelectorAll<HTMLElement>(':scope > :not(.player-transport)'),
	];

	return { art, body, close, columnsOnly, head, header, next, previous, sheets, tabs };
}
