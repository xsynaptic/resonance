import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels, PlayerUrls, QueueItem } from '#types.ts';
import type { PanelParts, PanelView } from '#waveform/panel/panel-view.ts';

import { defineOnce } from '#elements/define-once.ts';
import { PlayerPanelZoom } from '#elements/panel/panel-zoom.ts';
import { bind } from '#lib/bind.ts';
import { requireChild, requireChildren, template } from '#lib/render.ts';
import { loadedItem } from '#store/selectors.ts';
import { subscribeStoreTime } from '#store/subscribe-time.ts';
import { toCueSlot } from '#waveform/panel/cue-rider.ts';
import { createPanelDrag } from '#waveform/panel/panel-drag.ts';
import {
	createPanelView,
	isPanelMoving,
	openPanelArchive,
	paintPanelFrame,
	startPanelLoop,
} from '#waveform/panel/panel-view.ts';
import { createScrollClock } from '#waveform/panel/scroll-clock.ts';
import { subscribeTheme } from '#waveform/theme-change.ts';

interface PanelSource {
	item: QueueItem | undefined;
	pxPerSecond: number;
	resolveArchive: PlayerUrls['archive'];
}

// The arriving readout is hidden from assistive tech: it names a track that is not playing yet
const renderSurface = template(
	/* HTML */ `
		<div>
			<canvas aria-hidden="true" class="player-panel-canvas"></canvas>
			<div aria-hidden="true" class="player-panel-playhead"></div>
			<div aria-hidden="true" class="player-panel-ghost" hidden></div>
			<player-panel-zoom></player-panel-zoom>
			<div class="player-panel-readout">
				<p class="player-panel-now" data-empty>
					<span class="player-panel-now-artist"></span><span class="player-panel-now-title"></span
					><span class="player-panel-now-note"></span>
				</p>
				<p aria-hidden="true" class="player-panel-now" data-empty>
					<span class="player-panel-now-artist"></span><span class="player-panel-now-title"></span
					><span class="player-panel-now-note"></span>
				</p>
			</div>
		</div>
	`,
	HTMLDivElement,
);

export function connectPanelSurface(
	panel: HTMLElement,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	defineOnce('player-panel-zoom', PlayerPanelZoom);

	const parts = renderPanelParts(panel, labels);
	const clock = createScrollClock({
		elementTime: store.getState().getCurrentTime,
		subscribeTime: subscribeStoreTime(store),
	});
	const drag = createPanelDrag({
		canDrag: () => store.getState().currentIndex !== undefined,
		onSeek: (seconds) => {
			store.getState().seek(seconds);
		},
		panel: parts.panel,
		pxPerSecond: () => store.getState().panelPxPerSecond,
		signal,
	});
	let archive = openPanelArchive(undefined, undefined);
	let source: PanelSource | undefined;
	let view: PanelView | undefined;

	const wake = startPanelLoop({
		onFrame: (frameMs, insetPx) => {
			if (view) paintPanelFrame({ archive, clock, drag, frameMs, insetPx, store, view });

			return isPanelMoving(store.getState(), drag, view);
		},
		onResize: () => {
			view?.canvas.resize();
		},
		parts,
		signal,
	});

	const rebuild = (): void => {
		if (source === undefined) return;

		view = createPanelView({
			archive,
			item: source.item,
			parts,
			pxPerSecond: source.pxPerSecond,
		});

		if (parts.canvas.clientWidth > 0) view.canvas.resize();
		wake();
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

	const unsubscribeStore = store.subscribe(wake);
	const unsubscribeTheme = subscribeTheme(rebuild);

	parts.panel.addEventListener('pointerdown', wake, { signal });
	signal.addEventListener(
		'abort',
		() => {
			unsubscribeStore();
			unsubscribeTheme();
			clock.stop();
		},
		{ once: true },
	);
}

function renderPanelParts(panel: HTMLElement, labels: PlayerLabels): PanelParts {
	const surface = renderSurface();
	const canvas = requireChild(surface, 'canvas', HTMLCanvasElement);
	const context = canvas.getContext('2d');
	const ghost = requireChild(surface, '.player-panel-ghost', HTMLElement);
	const [parked, arriving] = requireChildren(surface, 'p', 2, HTMLParagraphElement);

	if (!context) throw new Error('The panel surface found no 2d context');

	for (const note of surface.querySelectorAll('.player-panel-now-note')) {
		note.textContent = labels.timestampsPartial;
	}

	panel.removeAttribute('aria-hidden');
	panel.setAttribute('aria-label', labels.waveformPanel);
	panel.setAttribute('role', 'group');
	panel.replaceChildren(...surface.children);

	return {
		arriving: toCueSlot(arriving),
		canvas,
		context,
		ghost,
		panel,
		parked: toCueSlot(parked),
	};
}

function selectPanelSource(state: PlayerStore): PanelSource {
	return {
		item: loadedItem(state),
		pxPerSecond: state.panelPxPerSecond,
		resolveArchive: state.urls?.archive,
	};
}
