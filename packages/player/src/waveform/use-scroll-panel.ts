import type { RefObject } from 'react';

import { useEffect, useSyncExternalStore } from 'react';

import type { QueueCuePoint } from '#types.ts';
import type { CueSlot } from '#waveform/cue-rider.ts';
import type { WaveformArchive } from '#waveform/waveform-archive.ts';

import { usePlayer, usePlayerStoreApi, useSubscribeTime } from '#store/context.tsx';
import { createCueRider, toCueSlot } from '#waveform/cue-rider.ts';
import { createGhostMarker } from '#waveform/ghost-marker.ts';
import { createPanelCanvas } from '#waveform/panel-canvas.ts';
import { createPanelDrag } from '#waveform/panel-drag.ts';
import { createScrollClock } from '#waveform/scroll-clock.ts';
import { getThemeVersion, subscribeTheme } from '#waveform/theme-version.ts';
import { openArchive } from '#waveform/waveform-archive.ts';

const noCuePoints: ReadonlyArray<QueueCuePoint> = [];

export interface PanelRefs {
	arriving: RefObject<HTMLParagraphElement | null>;
	canvas: RefObject<HTMLCanvasElement | null>;
	panel: RefObject<HTMLDivElement | null>;
	parked: RefObject<HTMLParagraphElement | null>;
}

interface PanelParts {
	arriving: CueSlot;
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	ghost: HTMLElement;
	panel: HTMLElement;
	parked: CueSlot;
}

// Owns the canvas, the frame loop and the pointer gesture; the caller only renders the shell onto the refs
export function useScrollPanel(refs: PanelRefs): void {
	// Destructured so the effect depends on each ref's own identity rather than the wrapper's
	const { arriving: arrivingRef, canvas: canvasRef, panel: panelRef, parked: parkedRef } = refs;

	const current = usePlayer((state) =>
		state.currentIndex === undefined ? undefined : state.queue[state.currentIndex],
	);
	const pxPerSecond = usePlayer((state) => state.panelPxPerSecond);
	const resolveArchive = usePlayer((state) => state.urls?.archive);
	const store = usePlayerStoreApi();
	const subscribeTime = useSubscribeTime();
	const themeVersion = useSyncExternalStore(subscribeTheme, getThemeVersion, zeroVersion);

	const cuePoints = current?.cuePoints ?? noCuePoints;
	const trackCount = current?.trackCount ?? cuePoints.length;
	const trackId = current?.trackId;

	useEffect(() => {
		const parts = toPanelParts({
			arriving: arrivingRef,
			canvas: canvasRef,
			panel: panelRef,
			parked: parkedRef,
		});
		if (!parts) return;

		const { arriving, canvas, context, ghost, panel, parked } = parts;

		let archive: undefined | WaveformArchive;
		let isCancelled = false;

		if (resolveArchive && trackId !== undefined) {
			void openArchive(resolveArchive, trackId).then((opened) => {
				if (!isCancelled) archive = opened;
			});
		}

		const surface = createPanelCanvas({
			canvas,
			context,
			cuePoints,
			pxPerSecond,
			readArchive: () => archive,
		});
		const clock = createScrollClock(subscribeTime, store.getState().getCurrentTime);
		const marker = createGhostMarker(ghost, pxPerSecond);
		const rider = createCueRider({
			arriving,
			cuePoints,
			parked,
			pxPerSecond,
			trackCount,
		});
		const drag = createPanelDrag({
			canDrag: () => store.getState().currentIndex !== undefined,
			// The panel shows the audible position, so the element's clock has to land that far ahead of it
			onSeek: (seconds) => {
				const state = store.getState();

				state.seek(seconds + state.getOutputDelay());
			},
			panel,
			pxPerSecond,
		});

		let frame = 0;

		const render = (frameMs: number): void => {
			frame = requestAnimationFrame(render);
			if (document.hidden) return;

			const state = store.getState();
			// Read every frame even while a drag overrides it, so the clock keeps its own elapsed time honest
			// What the listener is hearing rather than what the element has handed the graph; the delay is the difference
			const clockSeconds = Math.max(
				0,
				clock.read(frameMs, state.status === 'playing') - state.getOutputDelay(),
			);
			const targetSeconds = drag.targetSeconds();
			const currentTimeSeconds = targetSeconds ?? clockSeconds;
			const durationSeconds = state.durationSeconds ?? archiveDurationSeconds(archive);
			const windowStartSeconds = currentTimeSeconds - surface.windowSeconds() / 2;

			drag.showing(currentTimeSeconds, durationSeconds);
			marker.place(targetSeconds === undefined ? undefined : clockSeconds - targetSeconds);

			surface.scroll(windowStartSeconds, durationSeconds);
			rider.travel(windowStartSeconds, surface.fadeFromPx());
		};

		surface.resize();

		const observer = new ResizeObserver(() => {
			surface.resize();
		});

		observer.observe(canvas);
		frame = requestAnimationFrame(render);

		return () => {
			isCancelled = true;
			cancelAnimationFrame(frame);
			observer.disconnect();
			drag.stop();
			clock.stop();
		};
	}, [
		arrivingRef,
		canvasRef,
		cuePoints,
		panelRef,
		parkedRef,
		pxPerSecond,
		resolveArchive,
		store,
		subscribeTime,
		themeVersion,
		trackCount,
		trackId,
	]);
}

// The archive header's own length, for before the element has announced a duration
function archiveDurationSeconds(archive: undefined | WaveformArchive): number | undefined {
	if (!archive) return undefined;

	return archive.pairsTotal / archive.pairsPerSecond;
}

// One guard, so the effect does not open on a column of null checks
function toPanelParts(refs: PanelRefs): PanelParts | undefined {
	const canvas = refs.canvas.current;
	const panel = refs.panel.current;
	if (!canvas || !panel) return undefined;

	const context = canvas.getContext('2d');
	const ghost = panel.querySelector<HTMLElement>('.player-panel-ghost');
	const parked = toCueSlot(refs.parked.current);
	const arriving = toCueSlot(refs.arriving.current);
	if (!context || !ghost || !parked || !arriving) return undefined;

	return { arriving, canvas, context, ghost, panel, parked };
}

function zeroVersion(): number {
	return 0;
}
