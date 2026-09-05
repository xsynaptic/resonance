import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { MarqueeText } from '#components/marquee-text.tsx';

function renderMarquee(text = 'A Mix With A Title'): HTMLElement {
	const { container } = render(<MarqueeText text={text} />);
	const box = container.querySelector<HTMLElement>('.player-marquee');
	if (!box) throw new Error('The marquee rendered no box');

	return box;
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
	cleanup();
	for (const property of ['clientWidth', 'scrollWidth']) {
		Reflect.deleteProperty(HTMLSpanElement.prototype, property);
	}
});

describe('MarqueeText', () => {
	test('stays inert when the text fits its box', () => {
		stubMeasurement(180, 288);

		expect(renderMarquee()).not.toHaveAttribute('data-overflow');
	});

	test('marks the overflow and writes the distance it has to travel', () => {
		stubMeasurement(420, 288);

		const box = renderMarquee();

		expect(box).toHaveAttribute('data-overflow', '');
		expect(box.style.getPropertyValue('--player-marquee-distance')).toBe('132px');
	});

	test('holds at each end and travels the rest, so the cycle grows with the distance', () => {
		stubMeasurement(408, 288);

		const box = renderMarquee();

		// 120px at 40px/s is 3s each way, over two 8s holds
		expect(box.style.getPropertyValue('--player-marquee-duration')).toBe('22.00s');
		expect(box.style.getPropertyValue('--player-marquee-timing')).toBe(
			'linear(0 0%, 0 36.36%, 1 50.00%, 1 86.36%, 0 100%)',
		);
	});

	test('carries the line class alongside its own', () => {
		stubMeasurement(180, 288);

		const { container } = render(<MarqueeText className="player-track-artist" text="Basilisk" />);

		expect(container.querySelector('.player-marquee')).toHaveClass('player-track-artist');
	});
});
