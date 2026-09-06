import type { RefObject } from 'react';

import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { PlayerLabels, QueueCuePoint } from '#types.ts';
import type { WaveformArchive } from '#waveform/waveform-archive.ts';
import type { ScrollTheme } from '#waveform/waveform-scroll.ts';

import { usePlayer, usePlayerStoreApi, useSubscribeTime } from '#store/context.tsx';
import { createScrollClock } from '#waveform/scroll-clock.ts';
import { getThemeVersion, subscribeTheme } from '#waveform/theme-version.ts';
import { openArchive } from '#waveform/waveform-archive.ts';
import { createScrollPainter } from '#waveform/waveform-scroll.ts';

// A fixed density rather than a fixed span: below about 70 CSS px per second the envelope collapses into a band
const cssPerSecond = 70;

// Where a label parks once its boundary has swept past, and how far it trails that boundary on the way in
const cueRestPx = 16;
const cueGapPx = 8;

// How much of the panel the arriving boundary must still cross before the parked label starts to go
const cueFadeStart = 0.25;

const noCuePoints: ReadonlyArray<QueueCuePoint> = [];
const noSamples = new Int8Array(0);

// The last written values ride along, so a frame that moved nothing writes nothing to the DOM
interface CueSlot {
	artist: HTMLElement;
	clip: number;
	opacity: number;
	root: HTMLElement;
	title: HTMLElement;
	written: number;
	x: number;
}

type PanelLabels = Pick<PlayerLabels, 'timestampsPartial' | 'waveformPanel'>;

interface PanelParts {
	arriving: CueSlot;
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	panel: HTMLElement;
	parked: CueSlot;
}

interface PanelRefs {
	arriving: RefObject<HTMLParagraphElement | null>;
	canvas: RefObject<HTMLCanvasElement | null>;
	panel: RefObject<HTMLDivElement | null>;
	parked: RefObject<HTMLParagraphElement | null>;
}

// Closed renders nothing: a shut panel costs no canvas, no subscription and no requests
export function WaveformPanel({ labels }: { labels: PanelLabels }) {
	const isOpen = usePlayer((state) => state.isPanelOpen);

	if (!isOpen) return;

	return <WaveformPanelSurface labels={labels} />;
}

// The archive header's own length, for before the element has announced a duration
function archiveDurationS(archive: undefined | WaveformArchive): number | undefined {
	if (!archive) return undefined;

	return archive.pairsTotal / archive.pairsPerSecond;
}

// -1 until the first timestamp, where a mix indexed from part way in begins
function cueIndexAt(cuePoints: ReadonlyArray<QueueCuePoint>, currentTimeS: number): number {
	let found = -1;

	for (const [index, cue] of cuePoints.entries()) {
		if (cue.startS > currentTimeS) break;

		found = index;
	}

	return found;
}

// The arriving label is hidden from assistive tech: it names a track that is not playing yet
function CueReadout({
	isAhead,
	note,
	ref,
}: {
	isAhead: boolean;
	note: string;
	ref: RefObject<HTMLParagraphElement | null>;
}) {
	return (
		<p
			aria-hidden={isAhead ? 'true' : undefined}
			className="player-panel-now"
			data-empty=""
			ref={ref}
		>
			<span className="player-panel-now-artist" />
			<span className="player-panel-now-title" />
			<span className="player-panel-now-note">{note}</span>
		</p>
	);
}

// Read once per mount; `getPropertyValue` forces a style recalc and the loop runs every frame
function readScrollTheme(canvas: HTMLCanvasElement): ScrollTheme {
	const styles = getComputedStyle(canvas);

	return {
		boundaryStyle: styles.getPropertyValue('--player-text-bright'),
		edgeStyle: styles.getPropertyValue('--player-panel-edge'),
		gridStyle: styles.getPropertyValue('--player-border'),
		voidStyle: styles.getPropertyValue('--player-panel-void'),
		waveCoreStyle: styles.getPropertyValue('--player-panel-wave'),
		waveEdgeStyle: styles.getPropertyValue('--player-panel-wave-edge'),
	};
}

// A window is one or two chunks, and asking again for one the loader already has costs nothing
function requestSpan(
	archive: undefined | WaveformArchive,
	fromPair: number,
	toPair: number,
): number {
	if (!archive) return 0;

	archive.want(fromPair, toPair);

	return archive.landedChunks();
}

function toCueSlot(root: HTMLElement | null): CueSlot | undefined {
	const artist = root?.querySelector<HTMLElement>('.player-panel-now-artist');
	const title = root?.querySelector<HTMLElement>('.player-panel-now-title');
	if (!root || !artist || !title) return undefined;

	return { artist, clip: NaN, opacity: NaN, root, title, written: NaN, x: NaN };
}

// One guard, so the effect below does not open on five null checks
function toPanelParts(refs: PanelRefs): PanelParts | undefined {
	const canvas = refs.canvas.current;
	const context = canvas?.getContext('2d');
	const panel = refs.panel.current;
	const parked = toCueSlot(refs.parked.current);
	const arriving = toCueSlot(refs.arriving.current);
	if (!canvas || !context || !panel || !parked || !arriving) return undefined;

	return { arriving, canvas, context, panel, parked };
}

function WaveformPanelSurface({ labels }: { labels: PanelLabels }) {
	const current = usePlayer((state) =>
		state.currentIndex === undefined ? undefined : state.queue[state.currentIndex],
	);
	const resolveArchive = usePlayer((state) => state.urls?.archive);
	const store = usePlayerStoreApi();
	const subscribeTime = useSubscribeTime();
	const themeVersion = useSyncExternalStore(subscribeTheme, getThemeVersion, zeroVersion);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const parkedRef = useRef<HTMLParagraphElement>(null);
	const arrivingRef = useRef<HTMLParagraphElement>(null);

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

		const { arriving, canvas, context, panel, parked } = parts;

		let archive: undefined | WaveformArchive;
		let isCancelled = false;

		if (resolveArchive && trackId !== undefined) {
			void openArchive(resolveArchive, trackId).then((opened) => {
				if (!isCancelled) archive = opened;
			});
		}

		const painter = createScrollPainter(context, readScrollTheme(canvas));
		const clock = createScrollClock(subscribeTime, store.getState().getCurrentTime);

		// Measured on resize; reading these per frame would force a layout every frame
		let ratio = 1;
		let width = 0;
		let height = 0;
		let windowSeconds = 0;
		let pixelsPerSecond = 0;
		let fadeFromPx = 0;

		let paintedStartS = NaN;
		let paintedChunks = -1;

		// What the last frame drew: where a drag starts, and what it is clamped against
		let shownTimeS = 0;
		let shownDurationS: number | undefined;

		// A drag owns the position until the pointer is let go; one seek then commits where it landed
		let dragPointerId: number | undefined;
		let dragFromX = 0;
		let dragFromS = 0;
		let dragToS: number | undefined;

		// Reassigning width resets the backing store, so size first and let the next frame paint
		const sizeCanvas = (): void => {
			ratio = window.devicePixelRatio || 1;
			width = Math.max(1, Math.round(canvas.clientWidth * ratio));
			height = Math.max(1, Math.round(canvas.clientHeight * ratio));
			canvas.width = width;
			canvas.height = height;

			const cssWidth = Math.max(1, canvas.clientWidth);

			windowSeconds = cssWidth / cssPerSecond;
			pixelsPerSecond = width / windowSeconds;
			fadeFromPx = cssWidth * cueFadeStart;
			paintedStartS = NaN;
		};

		const scroll = (startS: number, durationS: number | undefined): void => {
			const loaded = archive;
			const pairsPerSecond = loaded?.pairsPerSecond ?? 0;
			const landedChunks = requestSpan(
				loaded,
				Math.floor(startS * pairsPerSecond),
				Math.ceil((startS + windowSeconds) * pairsPerSecond),
			);

			// Sub-pixel geometry, so the only frame worth skipping is one where nothing moved and nothing landed
			if (startS === paintedStartS && landedChunks === paintedChunks) return;

			paintedStartS = startS;
			paintedChunks = landedChunks;

			painter.paint(
				{
					cuePoints,
					durationS,
					height,
					pairsPerSecond,
					pixelsPerSecond,
					samples: loaded?.samples ?? noSamples,
					startS,
					width,
				},
				ratio,
			);
		};

		const boundaryX = (startS: number, index: number): number => {
			const cue = cuePoints[index];
			if (!cue) return Infinity;

			return (cue.startS - startS) * cssPerSecond + cueGapPx;
		};

		const writeCue = (slot: CueSlot, index: number): void => {
			if (slot.written === index) return;

			const cue = cuePoints[index];

			slot.written = index;
			slot.artist.textContent = cue?.artistLine ?? '';
			slot.title.textContent = cue?.title ?? '';
			slot.root.toggleAttribute('data-empty', cue === undefined);
			// Past the last timestamp of a tracklist carrying more tracks than timestamps, the title is a guess
			slot.root.toggleAttribute(
				'data-uncertain',
				index === cuePoints.length - 1 && trackCount > cuePoints.length,
			);
		};

		const place = (
			slot: CueSlot,
			startS: number,
			index: number,
			x: number,
			opacity: number,
		): void => {
			writeCue(slot, index);

			if (index < 0 || index >= cuePoints.length) return;

			if (x !== slot.x) {
				slot.x = x;
				slot.root.style.translate = `${x.toFixed(2)}px`;
			}

			if (opacity !== slot.opacity) {
				slot.opacity = opacity;
				slot.root.style.opacity = opacity.toFixed(3);
			}

			// The line that ends this track wipes the label away, so two labels never run through each other
			// Infinite where there is no next boundary, and an infinite length is a clip the CSSOM would drop
			const clip = boundaryX(startS, index + 1) - cueGapPx - x;

			if (clip !== slot.clip) {
				slot.clip = clip;
				slot.root.style.clipPath = Number.isFinite(clip)
					? `inset(0 calc(100% - ${clip.toFixed(2)}px) 0 0)`
					: 'none';
			}
		};

		// Each label rides its own boundary in and parks at the inset; the arriving one takes the parked one's place
		const travel = (startS: number): void => {
			const parkedIndex = cueIndexAt(cuePoints, startS + (cueRestPx - cueGapPx) / cssPerSecond);
			const arrivingX = boundaryX(startS, parkedIndex + 1);

			place(
				parked,
				startS,
				parkedIndex,
				Math.max(cueRestPx, boundaryX(startS, parkedIndex)),
				fadeOut(arrivingX),
			);
			place(arriving, startS, parkedIndex + 1, Math.max(cueRestPx, arrivingX), 1);
		};

		const fadeOut = (arrivingX: number): number => {
			if (arrivingX >= fadeFromPx) return 1;
			if (arrivingX <= cueRestPx) return 0;

			return (arrivingX - cueRestPx) / (fadeFromPx - cueRestPx);
		};

		// Dragging the waveform moves it with the finger, so pulling right walks back through the mix
		const onPointerDown = (event: PointerEvent): void => {
			if (event.button !== 0 || store.getState().currentIndex === undefined) return;

			dragPointerId = event.pointerId;
			dragFromX = event.clientX;
			dragFromS = shownTimeS;
			dragToS = shownTimeS;

			panel.setPointerCapture(event.pointerId);
			panel.toggleAttribute('data-dragging', true);
		};

		const onPointerMove = (event: PointerEvent): void => {
			if (event.pointerId !== dragPointerId) return;

			const targetS = dragFromS - (event.clientX - dragFromX) / cssPerSecond;

			dragToS = Math.min(shownDurationS ?? Infinity, Math.max(0, targetS));
		};

		// A cancelled drag commits too: the panel already moved, and snapping back reads as a dropped gesture
		const onPointerEnd = (event: PointerEvent): void => {
			if (event.pointerId !== dragPointerId) return;

			const state = store.getState();

			// The panel shows the audible position, so the element's clock has to land that far ahead of it
			if (dragToS !== undefined) state.seek(dragToS + state.getOutputDelay());

			dragPointerId = undefined;
			dragToS = undefined;
			panel.toggleAttribute('data-dragging', false);
		};

		let frame = 0;

		const render = (frameMs: number): void => {
			frame = requestAnimationFrame(render);
			if (document.hidden) return;

			const state = store.getState();
			// Read every frame even while a drag overrides it, so the clock keeps its own elapsed time honest
			// What the listener is hearing rather than what the element has handed the graph; the delay is the difference
			const clockS = Math.max(
				0,
				clock.read(frameMs, state.status === 'playing') - state.getOutputDelay(),
			);
			const currentTimeS = dragToS ?? clockS;
			const durationS = state.durationS ?? archiveDurationS(archive);
			const startS = currentTimeS - windowSeconds / 2;

			shownTimeS = currentTimeS;
			shownDurationS = durationS;

			scroll(startS, durationS);
			travel(startS);
		};

		sizeCanvas();

		const observer = new ResizeObserver(sizeCanvas);

		observer.observe(canvas);
		panel.addEventListener('pointercancel', onPointerEnd);
		panel.addEventListener('pointerdown', onPointerDown);
		panel.addEventListener('pointermove', onPointerMove);
		panel.addEventListener('pointerup', onPointerEnd);
		frame = requestAnimationFrame(render);

		return () => {
			isCancelled = true;
			cancelAnimationFrame(frame);
			observer.disconnect();
			panel.removeEventListener('pointercancel', onPointerEnd);
			panel.removeEventListener('pointerdown', onPointerDown);
			panel.removeEventListener('pointermove', onPointerMove);
			panel.removeEventListener('pointerup', onPointerEnd);
			clock.stop();
		};
	}, [cuePoints, resolveArchive, store, subscribeTime, themeVersion, trackCount, trackId]);

	return (
		<div aria-label={labels.waveformPanel} className="player-panel" ref={panelRef} role="group">
			<canvas aria-hidden="true" className="player-panel-canvas" ref={canvasRef} />
			<div aria-hidden="true" className="player-panel-playhead" />
			<div className="player-panel-readout">
				<CueReadout isAhead={false} note={labels.timestampsPartial} ref={parkedRef} />
				<CueReadout isAhead={true} note={labels.timestampsPartial} ref={arrivingRef} />
			</div>
		</div>
	);
}

function zeroVersion(): number {
	return 0;
}
