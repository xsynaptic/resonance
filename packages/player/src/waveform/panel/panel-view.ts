import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerUrls, QueueCuePoint, QueueItem } from '#types.ts';
import type { CueRider, CueSlot } from '#waveform/panel/cue-rider.ts';
import type { GhostMarker } from '#waveform/panel/ghost-marker.ts';
import type { PanelCanvas } from '#waveform/panel/panel-canvas.ts';
import type { PanelDrag } from '#waveform/panel/panel-drag.ts';
import type { ScrollClock } from '#waveform/panel/scroll-clock.ts';
import type { WaveformArchive } from '#waveform/panel/waveform-archive.ts';

import { observeResize } from '#lib/observe-resize.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { createCueRider } from '#waveform/panel/cue-rider.ts';
import { createGhostMarker } from '#waveform/panel/ghost-marker.ts';
import { createPanelCanvas } from '#waveform/panel/panel-canvas.ts';
import { createPanelDrag } from '#waveform/panel/panel-drag.ts';
import { openArchive } from '#waveform/panel/waveform-archive.ts';

const noCuePoints: ReadonlyArray<QueueCuePoint> = [];

export interface PanelArchive {
	current: undefined | WaveformArchive;
	// Tells a header still on its way from one that failed, which both leave `current` unset
	isOpening: boolean;
}

export interface PanelParts {
	arriving: CueSlot;
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	ghost: HTMLElement;
	panel: HTMLElement;
	parked: CueSlot;
}

// Everything that draws at one zoom; the archive and the clock outlive it
export interface PanelView {
	canvas: PanelCanvas;
	drag: PanelDrag;
	marker: GhostMarker;
	rider: CueRider;
}

interface PanelFrame {
	archive: PanelArchive;
	clock: ScrollClock;
	frameMs: number;
	insetPx: number;
	store: StoreApi<PlayerStore>;
	view: PanelView;
}

interface PanelLoop {
	onFrame: (frameMs: number, insetPx: number) => void;
	onResize: () => void;
	parts: Pick<PanelParts, 'canvas' | 'panel'>;
	signal: AbortSignal;
}

interface PanelViewOptions {
	archive: PanelArchive;
	clock: ScrollClock;
	item: QueueItem | undefined;
	parts: PanelParts;
	pxPerSecond: number;
	store: StoreApi<PlayerStore>;
}

export function createPanelView({
	archive,
	clock,
	item,
	parts,
	pxPerSecond,
	store,
}: PanelViewOptions): PanelView {
	const cuePoints = item?.cuePoints ?? noCuePoints;

	return {
		canvas: createPanelCanvas({
			canvas: parts.canvas,
			context: parts.context,
			cuePoints,
			isArchiveOpening: () => archive.isOpening,
			pxPerSecond,
			readArchive: () => archive.current,
		}),
		drag: createPanelDrag({
			canDrag: () => store.getState().currentIndex !== undefined,
			onSeek: (seconds) => {
				store.getState().seek(clock.toElementSeconds(seconds));
			},
			panel: parts.panel,
			pxPerSecond,
		}),
		marker: createGhostMarker(parts.ghost, pxPerSecond),
		rider: createCueRider({
			arriving: parts.arriving,
			cuePoints,
			parked: parts.parked,
			pxPerSecond,
			trackCount: item?.trackCount ?? cuePoints.length,
		}),
	};
}

// One slot per opening, so an answer landing after the panel moved on lands where nothing reads it
export function openPanelArchive(
	resolveArchive: PlayerUrls['archive'],
	item: QueueItem | undefined,
): PanelArchive {
	const slot: PanelArchive = { current: undefined, isOpening: false };
	if (!resolveArchive || item === undefined) return slot;

	slot.isOpening = true;
	void openArchive(resolveArchive, item).then((opened) => {
		slot.current = opened;
		slot.isOpening = false;
	});

	return slot;
}

export function paintPanelFrame({
	archive,
	clock,
	frameMs,
	insetPx,
	store,
	view,
}: PanelFrame): void {
	const state = store.getState();
	const isPlaying = state.status === 'playing';
	// Read every frame even while a drag overrides it, so the clock keeps its own elapsed time honest
	const clockSeconds = clock.read(frameMs, isPlaying);
	const targetSeconds = view.drag.targetSeconds();
	const currentTimeSeconds = targetSeconds ?? clockSeconds;
	const durationSeconds = state.durationSeconds ?? archiveDurationSeconds(archive.current);
	const windowStartSeconds = currentTimeSeconds - view.canvas.windowSeconds() / 2;

	view.drag.showing(currentTimeSeconds, durationSeconds);
	// A stopped track has no live position to mark, so the ghost would only double the playhead
	view.marker.place(
		targetSeconds === undefined || !isPlaying ? undefined : clockSeconds - targetSeconds,
	);

	view.canvas.scroll(windowStartSeconds, durationSeconds, frameMs);
	view.rider.travel(windowStartSeconds, view.canvas.fadeFromPx(), insetPx);
}

// A container query can hide the panel without removing it, which leaves nothing to draw
export function startPanelLoop({ onFrame, onResize, parts, signal }: PanelLoop): void {
	let frame = 0;
	let insetPx = 0;

	const render = (frameMs: number): void => {
		frame = requestAnimationFrame(render);
		if (document.hidden) return;

		onFrame(frameMs, insetPx);
	};

	observeResize(
		parts.canvas,
		() => {
			cancelAnimationFrame(frame);
			if (parts.canvas.clientWidth === 0) return;

			onResize();
			insetPx = readPxProperty(getComputedStyle(parts.panel), '--player-panel-inset-left', 0);
			frame = requestAnimationFrame(render);
		},
		signal,
	);
	signal.addEventListener(
		'abort',
		() => {
			cancelAnimationFrame(frame);
		},
		{ once: true },
	);
}

// The archive header's own length, for before the element has announced a duration
function archiveDurationSeconds(archive: undefined | WaveformArchive): number | undefined {
	if (!archive) return undefined;

	return archive.pairsTotal / archive.pairsPerSecond;
}
