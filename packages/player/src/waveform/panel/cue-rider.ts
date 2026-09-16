import type { QueueCuePoint } from '#types.ts';

import { cueIndexAt } from '#waveform/cue-points.ts';

// Where a label parks once its boundary has swept past, and how far it trails that boundary on the way in
const cueRestPx = 16;
const cueGapPx = 8;

export interface CueRider {
	// `fadeFromPx` and `insetPx` follow the panel's box, so they arrive per frame rather than at construction
	travel(windowStartSeconds: number, fadeFromPx: number, insetPx: number): void;
}

// The last written values ride along, so a frame that moved nothing writes nothing to the DOM
export interface CueSlot {
	artist: HTMLElement;
	clip: number;
	opacity: number;
	root: HTMLElement;
	title: HTMLElement;
	written: number;
	x: number;
}

interface CuePlacement {
	index: number;
	opacity: number;
	windowStartSeconds: number;
	x: number;
}

interface CueRiderOptions {
	arriving: CueSlot;
	cuePoints: ReadonlyArray<QueueCuePoint>;
	parked: CueSlot;
	pxPerSecond: number;
	trackCount: number;
}

// Each label rides its own boundary in and parks at the inset; the arriving one takes the parked one's place
export function createCueRider({
	arriving,
	cuePoints,
	parked,
	pxPerSecond,
	trackCount,
}: CueRiderOptions): CueRider {
	function boundaryX(windowStartSeconds: number, index: number): number {
		const cue = cuePoints[index];
		if (!cue) return Infinity;

		return (cue.startSeconds - windowStartSeconds) * pxPerSecond + cueGapPx;
	}

	function writeCue(slot: CueSlot, index: number): void {
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
	}

	function place(slot: CueSlot, { index, opacity, windowStartSeconds, x }: CuePlacement): void {
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

		// Clipped at the next boundary so two labels never overlap; a missing boundary would be an infinite clip the CSSOM drops
		const clip = boundaryX(windowStartSeconds, index + 1) - cueGapPx - x;

		if (clip !== slot.clip) {
			slot.clip = clip;
			slot.root.style.clipPath = Number.isFinite(clip)
				? `inset(0 calc(100% - ${clip.toFixed(2)}px) 0 0)`
				: 'none';
		}
	}

	return {
		travel(windowStartSeconds, fadeFromPx, insetPx) {
			const restPx = cueRestPx + insetPx;
			const parkedIndex = cueIndexAt(
				cuePoints,
				windowStartSeconds + (restPx - cueGapPx) / pxPerSecond,
			);
			const arrivingX = boundaryX(windowStartSeconds, parkedIndex + 1);

			place(parked, {
				index: parkedIndex,
				opacity: fadeOut({ arrivingX, fadeFromPx, restPx }),
				windowStartSeconds,
				x: Math.max(restPx, boundaryX(windowStartSeconds, parkedIndex)),
			});
			place(arriving, {
				index: parkedIndex + 1,
				opacity: 1,
				windowStartSeconds,
				x: Math.max(restPx, arrivingX),
			});
		},
	};
}

export function toCueSlot(root: HTMLElement | null): CueSlot | undefined {
	const artist = root?.querySelector<HTMLElement>('.player-panel-now-artist');
	const title = root?.querySelector<HTMLElement>('.player-panel-now-title');
	if (!root || !artist || !title) return undefined;

	return { artist, clip: NaN, opacity: NaN, root, title, written: NaN, x: NaN };
}

function fadeOut({
	arrivingX,
	fadeFromPx,
	restPx,
}: {
	arrivingX: number;
	fadeFromPx: number;
	restPx: number;
}): number {
	if (arrivingX >= fadeFromPx) return 1;
	if (arrivingX <= restPx) return 0;

	return (arrivingX - restPx) / (fadeFromPx - restPx);
}
