import { afterEach, describe, expect, test } from 'vitest';

import { renderMarquee, writeMarquee } from '#lib/marquee.ts';

function marqueeOf(text = 'A Mix With A Title'): HTMLSpanElement {
	const parts = renderMarquee();

	writeMarquee(parts, text);

	return parts.box;
}

// happy-dom lays nothing out, so the box reports whatever the test says it measures
function stubMeasurement(scrollWidth: number, clientWidth: number): void {
	const measurements = Object.entries({ clientWidth, scrollWidth });

	for (const [property, value] of measurements) {
		Object.defineProperty(HTMLSpanElement.prototype, property, {
			configurable: true,
			value,
		});
	}
}

afterEach(() => {
	for (const property of ['clientWidth', 'scrollWidth']) {
		Reflect.deleteProperty(HTMLSpanElement.prototype, property);
	}
});

describe('marquee', () => {
	test('stays inert when the text fits its box', () => {
		stubMeasurement(180, 288);

		expect(marqueeOf().dataset.overflow).toBeUndefined();
	});

	test('marks the overflow and writes the distance it has to travel', () => {
		stubMeasurement(420, 288);

		const box = marqueeOf();

		expect(box.dataset.overflow).toBe('');
		expect(box.style.getPropertyValue('--player-marquee-distance')).toBe('132px');
	});

	test('holds at each end and travels the rest, so the cycle grows with the distance', () => {
		stubMeasurement(408, 288);

		const box = marqueeOf();

		// 120px at 40px/s is 3s each way, over two 8s holds
		expect(box.style.getPropertyValue('--player-marquee-duration')).toBe('22.00s');
		expect(box.style.getPropertyValue('--player-marquee-timing')).toBe(
			'linear(0 0%, 0 36.36%, 1 50.00%, 1 86.36%, 0 100%)',
		);
	});

	test('drops the travel once a shorter text fits', () => {
		stubMeasurement(420, 288);

		const parts = renderMarquee();

		writeMarquee(parts, 'A long title');
		stubMeasurement(180, 288);
		writeMarquee(parts, 'Short');

		expect(parts.box.dataset.overflow).toBeUndefined();
		expect(parts.box.style.getPropertyValue('--player-marquee-distance')).toBe('');
	});
});
