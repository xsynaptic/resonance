const arrowStepSeconds = 5;
const pageStepSeconds = 60;

export interface BufferedSpan {
	fromPx: number;
	toPx: number;
}

interface KeyScrub {
	currentSeconds: number;
	durationSeconds: number;
	scrubSeconds: number | undefined;
}

interface SliderKeys {
	commit: () => void;
	hold: (seconds: number) => void;
	position: () => KeyScrub | undefined;
	seek: (seconds: number) => void;
}

const keyStepsSeconds = new Map<string, number>([
	['ArrowDown', -arrowStepSeconds],
	['ArrowLeft', -arrowStepSeconds],
	['ArrowRight', arrowStepSeconds],
	['ArrowUp', arrowStepSeconds],
	['PageDown', -pageStepSeconds],
	['PageUp', pageStepSeconds],
]);

export function bindSliderKeys(element: HTMLElement, keys: SliderKeys, signal: AbortSignal): void {
	element.addEventListener(
		'keydown',
		(event) => {
			const position = keys.position();
			const seconds = position && keyScrubSeconds(event, position);
			if (seconds === undefined) return;

			event.preventDefault();

			if (!event.repeat) {
				keys.seek(seconds);
				return;
			}

			keys.hold(seconds);
		},
		{ signal },
	);
	element.addEventListener(
		'keyup',
		(event) => {
			if (isSliderKey(event.key)) keys.commit();
		},
		{ signal },
	);
}

export function bufferedKey(spans: ReadonlyArray<BufferedSpan>): string {
	return spans.map(({ fromPx, toPx }) => `${String(fromPx)}-${String(toPx)}`).join(',');
}

export function bufferedSpans(
	ranges: TimeRanges | undefined,
	durationSeconds: number | undefined,
	width: number,
): Array<BufferedSpan> {
	if (ranges === undefined || !durationSeconds || durationSeconds <= 0) return [];

	const spans: Array<BufferedSpan> = [];

	for (let index = 0; index < ranges.length; index += 1) {
		const fromPx = pixelAt(ranges.start(index), durationSeconds, width) ?? 0;
		const toPx = pixelAt(ranges.end(index), durationSeconds, width) ?? 0;

		// A range narrower than a device pixel draws nothing, and keeping it would repaint on every growth
		if (toPx > fromPx) spans.push({ fromPx, toPx });
	}

	return spans;
}

export function pointerRatio(rect: DOMRect, pointer: { clientX: number }): number {
	return Math.min(1, Math.max(0, (pointer.clientX - rect.left) / rect.width));
}

function isSliderKey(key: string): boolean {
	return key === 'Home' || key === 'End' || keyStepsSeconds.has(key);
}

function keyScrubSeconds(
	event: { key: string; repeat: boolean },
	{ currentSeconds, durationSeconds, scrubSeconds }: KeyScrub,
): number | undefined {
	const fromSeconds = event.repeat ? (scrubSeconds ?? currentSeconds) : currentSeconds;
	const target = keyTarget(event.key, fromSeconds, durationSeconds);
	if (target === undefined) return undefined;

	return Math.min(durationSeconds, Math.max(0, target));
}

function keyTarget(
	key: string,
	currentTimeSeconds: number,
	durationSeconds: number,
): number | undefined {
	if (key === 'Home') return 0;
	if (key === 'End') return durationSeconds;

	const step = keyStepsSeconds.get(key);

	return step === undefined ? undefined : currentTimeSeconds + step;
}

function pixelAt(
	seconds: number | undefined,
	durationSeconds: number | undefined,
	width: number,
): number | undefined {
	if (seconds === undefined) return undefined;
	if (!durationSeconds || durationSeconds <= 0) return 0;

	return Math.round(Math.min(1, Math.max(0, seconds / durationSeconds)) * width);
}
