import type { RefObject } from 'react';

import { useEffect, useSyncExternalStore } from 'react';

import type { PanelParts } from '#waveform/scroll-panel.ts';

import { usePlayer, usePlayerStoreApi, useSubscribeTime } from '#store/context.tsx';
import { loadedItem } from '#store/selectors.ts';
import { toCueSlot } from '#waveform/cue-rider.ts';
import { createScrollClock } from '#waveform/scroll-clock.ts';
import {
	createPanelView,
	openPanelArchive,
	paintPanelFrame,
	startPanelLoop,
} from '#waveform/scroll-panel.ts';
import { getThemeVersion, subscribeTheme } from '#waveform/theme-version.ts';

export interface PanelRefs {
	arriving: RefObject<HTMLParagraphElement | null>;
	canvas: RefObject<HTMLCanvasElement | null>;
	panel: RefObject<HTMLDivElement | null>;
	parked: RefObject<HTMLParagraphElement | null>;
}

// Owns the canvas, the frame loop and the pointer gesture; the caller only renders the shell onto the refs
export function useScrollPanel(refs: PanelRefs): void {
	// Destructured so the effect depends on each ref's own identity rather than the wrapper's
	const { arriving: arrivingRef, canvas: canvasRef, panel: panelRef, parked: parkedRef } = refs;

	const current = usePlayer(loadedItem);
	const pxPerSecond = usePlayer((state) => state.panelPxPerSecond);
	const resolveArchive = usePlayer((state) => state.urls?.archive);
	const store = usePlayerStoreApi();
	const subscribeTime = useSubscribeTime();
	const themeVersion = useSyncExternalStore(subscribeTheme, getThemeVersion, zeroVersion);

	useEffect(() => {
		const parts = toPanelParts({
			arriving: arrivingRef,
			canvas: canvasRef,
			panel: panelRef,
			parked: parkedRef,
		});
		if (!parts) return;

		const archive = openPanelArchive(resolveArchive, current);
		const clock = createScrollClock({
			elementTime: store.getState().getCurrentTime,
			outputDelay: store.getState().getOutputDelay,
			subscribeTime,
		});
		const view = createPanelView({ archive, clock, item: current, parts, pxPerSecond, store });
		const stopLoop = startPanelLoop({
			onFrame: (frameMs, insetPx) => {
				paintPanelFrame({ archive, clock, frameMs, insetPx, store, view });
			},
			onResize: () => {
				view.surface.resize();
			},
			parts,
		});

		return () => {
			stopLoop();
			view.drag.stop();
			clock.stop();
		};
	}, [
		arrivingRef,
		canvasRef,
		current,
		panelRef,
		parkedRef,
		pxPerSecond,
		resolveArchive,
		store,
		subscribeTime,
		themeVersion,
	]);
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
