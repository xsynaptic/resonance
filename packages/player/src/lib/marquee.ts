import { observeResize } from '#lib/observe-resize.ts';
import { requireChild, template } from '#lib/render.ts';

export interface MarqueeParts {
	box: HTMLSpanElement;
	line: HTMLSpanElement;
}

const marqueeHoldSeconds = 8;

const renderBox = template(
	'<span class="player-marquee"><span class="player-marquee-text"></span></span>',
	HTMLSpanElement,
);

const measured = new WeakMap<HTMLElement, number>();

// Travel is proportional to the distance, so a long title marches rather than flying
const tempoPixelsPerSecond = 40;

export function bindMarquee(parts: MarqueeParts, signal: AbortSignal): void {
	observeResize(
		parts.box,
		() => {
			measureMarquee(parts.box);
		},
		signal,
	);
}

export function renderMarquee(): MarqueeParts {
	const box = renderBox();

	return { box, line: requireChild(box, '.player-marquee-text', HTMLSpanElement) };
}

// One line that marches only when it does not fit
export function writeMarquee(parts: MarqueeParts, text: string): void {
	parts.line.textContent = text;
	measureMarquee(parts.box);
}

// A keyframe selector cannot read a custom property, so the two holds ride in a `linear()` easing instead
function marqueeProperties(distance: number) {
	const travelSeconds = distance / tempoPixelsPerSecond;
	const totalSeconds = marqueeHoldSeconds * 2 + travelSeconds * 2;
	const holdEnd = percentOf(marqueeHoldSeconds, totalSeconds);
	const travelEnd = percentOf(marqueeHoldSeconds + travelSeconds, totalSeconds);
	const holdBackEnd = percentOf(marqueeHoldSeconds * 2 + travelSeconds, totalSeconds);

	return {
		'--player-marquee-distance': `${String(distance)}px`,
		'--player-marquee-duration': `${totalSeconds.toFixed(2)}s`,
		'--player-marquee-timing': `linear(0 0%, 0 ${holdEnd}%, 1 ${travelEnd}%, 1 ${holdBackEnd}%, 0 100%)`,
	};
}

// Rewriting the properties re-maps a running animation, so an unchanged measurement leaves them alone
function measureMarquee(box: HTMLElement): void {
	const distance = overflowDistance(box);
	if (distance === measured.get(box)) return;

	measured.set(box, distance);
	box.toggleAttribute('data-overflow', distance > 0);
	box.removeAttribute('style');
	if (distance === 0) return;

	const properties = marqueeProperties(distance);

	for (const [property, value] of Object.entries(properties)) {
		box.style.setProperty(property, value);
	}
}

function overflowDistance(box: HTMLElement): number {
	return Math.max(0, Math.round(box.scrollWidth - box.clientWidth));
}

function percentOf(elapsedSeconds: number, totalSeconds: number): string {
	return ((elapsedSeconds / totalSeconds) * 100).toFixed(2);
}
