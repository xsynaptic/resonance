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
import { fillButton } from '#lib/sonic-button.ts';

interface BodyParts {
	actions: HTMLElement;
	art: HTMLElement;
	body: HTMLDivElement;
	close: HTMLElement;
	columnsOnly: Array<HTMLElement>;
	header: HTMLElement;
	next: HTMLElement;
	previous: HTMLElement;
	sheets: HTMLElement;
	tablist: HTMLElement;
	tabs: HTMLElement;
}

type LinkClick = Pick<
	MouseEvent,
	'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'
>;

interface OverlayFit {
	isActionsInHeader: boolean;
	layout: OverlayLayout;
}

type OverlayLayout = 'columns' | 'phone';

// Rem, so the switch follows the reader's font size as a media query would
const columnsMinWidthRem = 40;
const columnsMinHeightRem = 30;
const headerActionsMinWidthRem = 30;

// The stylesheet's artwork caps for each layout; the phone cover is full bleed, so it takes no padding off
const artworkSizes =
	'(width >= 40rem) and (height >= 30rem) min(40vw, 100vh, 900px), (orientation: landscape) min(50vw, 100vh, 900px), min(100vw, 60vh, 40rem)';

const renderBody = template(
	/* HTML */ `
		<div class="pzm-overlay-body" data-layout="columns">
			<div class="pzm-overlay-layout">
				<div class="pzm-overlay-art">
					<pzm-artwork sizes="${artworkSizes}"></pzm-artwork>
				</div>
				<div class="pzm-overlay-deck">
					<div class="pzm-overlay-head">
						<sonic-button class="pzm-overlay-close"></sonic-button>
						<div class="pzm-track pzm-overlay-track">
							<pzm-title></pzm-title>
							<div class="pzm-track-meta">
								<pzm-artist-line></pzm-artist-line><pzm-time></pzm-time>
							</div>
							<pzm-scrub-readout></pzm-scrub-readout>
						</div>
					</div>
					<div class="pzm-overlay-scrub">
						<pzm-time-slider></pzm-time-slider><pzm-status></pzm-status>
					</div>
					<div class="pzm-overlay-controls">
						<div class="pzm-transport">
							<pzm-step-button direction="previous"></pzm-step-button
							><pzm-play-button></pzm-play-button
							><pzm-step-button direction="next"></pzm-step-button>
						</div>
						<pzm-panel-toggle></pzm-panel-toggle><pzm-volume></pzm-volume>
					</div>
					<pzm-panel></pzm-panel>
					<div class="pzm-overlay-tabs">
						<div class="pzm-header">
							<div class="pzm-overlay-tablist" role="tablist"></div>
							<pzm-queue-actions></pzm-queue-actions>
						</div>
						<div class="pzm-overlay-list" role="tabpanel"></div>
					</div>
					<div class="pzm-overlay-sheets" hidden>
						<sonic-button popup="dialog"></sonic-button><pzm-panel-toggle></pzm-panel-toggle>
						<dialog class="pzm-overlay-sheet" tabindex="-1">
							<sonic-button class="pzm-overlay-close"></sonic-button>
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
	defineOnce('pzm-cue-list', PlayerTracklist);

	const { labels, root, store, view } = context;
	const parts = renderBodyParts();
	const sheet = bindSheets(parts.sheets, context, signal);

	if (!root.isArtworkEnabled) parts.art.remove();
	if (!root.isPanelEnabled) {
		for (const part of parts.body.querySelectorAll('pzm-panel, pzm-panel-toggle')) part.remove();
	}
	placeSeekButtons(parts.previous, parts.next, store.getState().seekSeconds);

	parts.close.setAttribute('aria-label', labels.close);
	fillButton(parts.close, [cloneIcon('closeLarge')]);
	parts.close.addEventListener(
		'click',
		() => {
			view.getState().setOverlayOpen(false);
		},
		{ signal },
	);
	parts.body.addEventListener(
		'click',
		(event) => {
			if (isLeavingPage(event)) view.getState().setOverlayOpen(false);
		},
		{ capture: true, signal },
	);
	bindTabs(parts.tabs, context, signal);
	host.append(parts.body);
	if (root.isArtworkEnabled) {
		bindOverlayGrab(
			{
				onDismiss: () => {
					view.getState().setOverlayOpen(false);
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
		{
			actions: (isActionsInHeader) => {
				if (isActionsInHeader) parts.tablist.after(parts.actions);
				else parts.header.after(parts.actions);
			},
			layout: (layout) => {
				parts.body.dataset.layout = layout;
				parts.sheets.hidden = layout === 'columns';
				for (const control of parts.columnsOnly) control.hidden = layout !== 'columns';

				if (layout === 'phone') {
					sheet.dialog.append(parts.tabs);
					parts.header.append(sheet.close);
					return;
				}

				sheet.closeSheetNow();
				sheet.dialog.append(sheet.close);
				parts.sheets.before(parts.tabs);
			},
		},
		signal,
	);
}

function bindLayout(
	body: HTMLElement,
	apply: { actions: (isActionsInHeader: boolean) => void; layout: (layout: OverlayLayout) => void },
	signal: AbortSignal,
): void {
	let applied: OverlayFit | undefined;

	const measure = (): void => {
		const { height, width } = body.getBoundingClientRect();

		if (width === 0) return;

		const fit = fitFor(width, height);

		if (fit.layout !== applied?.layout) apply.layout(fit.layout);
		if (fit.isActionsInHeader !== applied?.isActionsInHeader) apply.actions(fit.isActionsInHeader);

		applied = fit;
	};
	observeResize(body, measure, signal);
	measure();
}

function fitFor(width: number, height: number): OverlayFit {
	const remPixels = readPxProperty(getComputedStyle(document.documentElement), 'font-size', 16);
	const layout =
		width >= columnsMinWidthRem * remPixels && height >= columnsMinHeightRem * remPixels
			? 'columns'
			: 'phone';

	return {
		isActionsInHeader: layout === 'columns' || width >= headerActionsMinWidthRem * remPixels,
		layout,
	};
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

function renderBodyParts(): BodyParts {
	const body = renderBody();
	const actions = requireChild(body, 'pzm-queue-actions', HTMLElement);
	const art = requireChild(body, '.pzm-overlay-art', HTMLElement);
	const close = requireChild(body, '.pzm-overlay-close', HTMLElement);
	const controls = requireChild(body, '.pzm-overlay-controls', HTMLElement);
	const header = requireChild(body, '.pzm-header', HTMLElement);
	const sheets = requireChild(body, '.pzm-overlay-sheets', HTMLElement);
	const tablist = requireChild(body, '.pzm-overlay-tablist', HTMLElement);
	const tabs = requireChild(body, '.pzm-overlay-tabs', HTMLElement);
	const [previous, next] = requireChildren(body, 'pzm-step-button', 2, HTMLElement);

	const columnsOnly = [...controls.querySelectorAll<HTMLElement>(':scope > :not(.pzm-transport)')];

	return {
		actions,
		art,
		body,
		close,
		columnsOnly,
		header,
		next,
		previous,
		sheets,
		tablist,
		tabs,
	};
}
