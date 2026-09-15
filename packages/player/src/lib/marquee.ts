import { marqueeProperties, overflowDistance } from '#lib/marquee-timing.ts';
import { template } from '#lib/render.ts';

export interface MarqueeParts {
	box: HTMLSpanElement;
	line: HTMLSpanElement;
}

const renderBox = template(
	'<span class="player-marquee"><span class="player-marquee-text"></span></span>',
	HTMLSpanElement,
);

export function bindMarquee(parts: MarqueeParts, signal: AbortSignal): void {
	const observer = new ResizeObserver(() => {
		measureMarquee(parts.box);
	});

	observer.observe(parts.box);
	signal.addEventListener(
		'abort',
		() => {
			observer.disconnect();
		},
		{ once: true },
	);
}

export function renderMarquee(): MarqueeParts {
	const box = renderBox();
	const line = box.firstElementChild;
	if (!(line instanceof HTMLSpanElement)) throw new Error('The marquee template carries no line');

	return { box, line };
}

// One line that marches only when it does not fit; the measurement is the whole mechanism, there is no timer
export function writeMarquee(parts: MarqueeParts, text: string): void {
	parts.line.textContent = text;
	measureMarquee(parts.box);
}

function measureMarquee(box: HTMLElement): void {
	const distance = overflowDistance(box);

	box.toggleAttribute('data-overflow', distance > 0);
	box.removeAttribute('style');
	if (distance === 0) return;

	const properties: Record<string, string> = { ...marqueeProperties(distance) };

	for (const [property, value] of Object.entries(properties)) {
		box.style.setProperty(property, value);
	}
}
