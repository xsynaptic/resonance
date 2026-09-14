import { expect, test } from 'vitest';

import { placeholderRange } from '#waveform/waveform-scroll.ts';

const view = { durationSeconds: 60, pixelsPerSecond: 10, width: 100 };

test('stops the sine where the Mix starts', () => {
	expect(
		placeholderRange({ ...view, windowStartSeconds: -2 }, { fromSeconds: -2, toSeconds: 8 }),
	).toStrictEqual({ closingX: 100, openingX: 20 });
});

test('stops the sine where the Mix ends', () => {
	expect(
		placeholderRange({ ...view, windowStartSeconds: 55 }, { fromSeconds: 55, toSeconds: 65 }),
	).toStrictEqual({ closingX: 50, openingX: 0 });
});

test('draws across the window while the duration is unknown', () => {
	expect(
		placeholderRange(
			{ ...view, durationSeconds: undefined, windowStartSeconds: 20 },
			{ fromSeconds: 20, toSeconds: 30 },
		),
	).toStrictEqual({ closingX: 100, openingX: 0 });
});

test('draws nothing for a span outside the window', () => {
	expect(
		placeholderRange({ ...view, windowStartSeconds: 0 }, { fromSeconds: 30, toSeconds: 40 }),
	).toBeUndefined();
});
