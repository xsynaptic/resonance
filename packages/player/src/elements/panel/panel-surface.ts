import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels, PlayerUrls, QueueItem } from '#types.ts';
import type { PanelParts, PanelView } from '#waveform/scroll-panel.ts';

import { PlayerPanelZoom } from '#elements/panel/panel-zoom.ts';
import { bind } from '#lib/bind.ts';
import { template } from '#lib/render.ts';
import { subscribeStoreTime } from '#lib/subscribe-time.ts';
import { loadedItem } from '#store/selectors.ts';
import { toCueSlot } from '#waveform/cue-rider.ts';
import { createScrollClock } from '#waveform/scroll-clock.ts';
import {
	createPanelView,
	openPanelArchive,
	paintPanelFrame,
	startPanelLoop,
} from '#waveform/scroll-panel.ts';
import { subscribeTheme } from '#waveform/theme-version.ts';

interface PanelSource {
	item: QueueItem | undefined;
	pxPerSecond: number;
	resolveArchive: PlayerUrls['archive'];
}

// The arriving readout is hidden from assistive tech: it names a track that is not playing yet
const renderSurface = template(
	'<div><canvas aria-hidden="true" class="player-panel-canvas"></canvas><div aria-hidden="true" class="player-panel-playhead"></div><div aria-hidden="true" class="player-panel-ghost" hidden></div><player-panel-zoom></player-panel-zoom><div class="player-panel-readout"><p class="player-panel-now" data-empty><span class="player-panel-now-artist"></span><span class="player-panel-now-title"></span><span class="player-panel-now-note"></span></p><p aria-hidden="true" class="player-panel-now" data-empty><span class="player-panel-now-artist"></span><span class="player-panel-now-title"></span><span class="player-panel-now-note"></span></p></div></div>',
	HTMLDivElement,
);

export function connectPanelSurface(
	panel: HTMLElement,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	if (!customElements.get('player-panel-zoom')) {
		customElements.define('player-panel-zoom', PlayerPanelZoom);
	}

	const parts = renderPanelParts(panel, labels);
	const clock = createScrollClock({
		elementTime: store.getState().getCurrentTime,
		outputDelay: store.getState().getOutputDelay,
		subscribeTime: subscribeStoreTime(store),
	});
	let archive = openPanelArchive(undefined, undefined);
	let source: PanelSource | undefined;
	let view: PanelView | undefined;

	const rebuild = (): void => {
		if (source === undefined) return;

		view?.drag.stop();
		view = createPanelView({
			archive,
			clock,
			item: source.item,
			parts,
			pxPerSecond: source.pxPerSecond,
			store,
		});

		if (parts.canvas.clientWidth > 0) view.surface.resize();
	};

	bind(
		store,
		selectPanelSource,
		(next) => {
			if (next.item !== source?.item || next.resolveArchive !== source?.resolveArchive) {
				archive = openPanelArchive(next.resolveArchive, next.item);
			}

			source = next;
			rebuild();
		},
		signal,
	);

	const stopLoop = startPanelLoop({
		onFrame: (frameMs, insetPx) => {
			if (view) paintPanelFrame({ archive, clock, frameMs, insetPx, store, view });
		},
		onResize: () => {
			view?.surface.resize();
		},
		parts,
	});
	const unsubscribeTheme = subscribeTheme(rebuild);

	signal.addEventListener(
		'abort',
		() => {
			stopLoop();
			unsubscribeTheme();
			view?.drag.stop();
			clock.stop();
		},
		{ once: true },
	);
}

function renderPanelParts(panel: HTMLElement, labels: PlayerLabels): PanelParts {
	const surface = renderSurface();
	const canvas = surface.querySelector('canvas');
	const context = canvas?.getContext('2d');
	const ghost = surface.querySelector<HTMLElement>('.player-panel-ghost');
	const [parked, arriving] = [...surface.querySelectorAll('p')].map((slot) => toCueSlot(slot));

	if (!canvas || !context || !ghost || !parked || !arriving) {
		throw new Error('The panel surface found no 2d context or lost part of its template');
	}

	for (const note of surface.querySelectorAll('.player-panel-now-note')) {
		note.textContent = labels.timestampsPartial;
	}

	panel.removeAttribute('aria-hidden');
	panel.setAttribute('aria-label', labels.waveformPanel);
	panel.setAttribute('role', 'group');
	panel.replaceChildren(...surface.children);

	return { arriving, canvas, context, ghost, panel, parked };
}

function selectPanelSource(state: PlayerStore): PanelSource {
	return {
		item: loadedItem(state),
		pxPerSecond: state.panelPxPerSecond,
		resolveArchive: state.urls?.archive,
	};
}
