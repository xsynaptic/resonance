import type { QueueCuePoint } from '#types.ts';

// Where a label parks once its boundary has swept past, and how far it trails that boundary on the way in
const cueRestPx = 16;
const cueGapPx = 8;

export interface CueRider {
	// `fadeFromPx` follows the panel's width, so it arrives per frame rather than at construction
	travel(windowStartSeconds: number, fadeFromPx: number): void;
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

		// The line that ends this track wipes the label away, so two labels never run through each other
		// Infinite where there is no next boundary, and an infinite length is a clip the CSSOM would drop
		const clip = boundaryX(windowStartSeconds, index + 1) - cueGapPx - x;

		if (clip !== slot.clip) {
			slot.clip = clip;
			slot.root.style.clipPath = Number.isFinite(clip)
				? `inset(0 calc(100% - ${clip.toFixed(2)}px) 0 0)`
				: 'none';
		}
	}

	return {
		travel(windowStartSeconds, fadeFromPx) {
			const parkedIndex = cueIndexAt(
				cuePoints,
				windowStartSeconds + (cueRestPx - cueGapPx) / pxPerSecond,
			);
			const arrivingX = boundaryX(windowStartSeconds, parkedIndex + 1);

			place(parked, {
				index: parkedIndex,
				opacity: fadeOut(arrivingX, fadeFromPx),
				windowStartSeconds,
				x: Math.max(cueRestPx, boundaryX(windowStartSeconds, parkedIndex)),
			});
			place(arriving, {
				index: parkedIndex + 1,
				opacity: 1,
				windowStartSeconds,
				x: Math.max(cueRestPx, arrivingX),
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

// -1 until the first timestamp, where a mix indexed from part way in begins
function cueIndexAt(cuePoints: ReadonlyArray<QueueCuePoint>, currentTimeSeconds: number): number {
	let found = -1;

	for (const [index, cue] of cuePoints.entries()) {
		if (cue.startSeconds > currentTimeSeconds) break;

		found = index;
	}

	return found;
}

function fadeOut(arrivingX: number, fadeFromPx: number): number {
	if (arrivingX >= fadeFromPx) return 1;
	if (arrivingX <= cueRestPx) return 0;

	return (arrivingX - cueRestPx) / (fadeFromPx - cueRestPx);
}
