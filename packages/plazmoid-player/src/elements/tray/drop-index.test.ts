import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { dropIndex } from '#elements/tray/drop-index.ts';

// Four rows 40px tall from a list scrolled to the top
const midpoints = [20, 60, 100, 140];

const longestQueueChecked = 8;

const midpointsSortedTopDownByConvention = fc
	.array(fc.integer({ max: 200, min: 0 }), { maxLength: longestQueueChecked, minLength: 1 })
	.map((values) => values.toSorted((first, second) => first - second));

const dragOverMeasuredRows = midpointsSortedTopDownByConvention.chain((rowMidpoints) =>
	fc.record({
		from: fc.nat({ max: rowMidpoints.length - 1 }),
		midpoints: fc.constant(rowMidpoints),
		pointers: fc
			.tuple(fc.integer({ max: 220, min: -20 }), fc.integer({ max: 220, min: -20 }))
			.map(([first, second]) => [Math.min(first, second), Math.max(first, second)] as const),
	}),
);

describe('dropIndex', () => {
	test.prop([dragOverMeasuredRows], { numRuns: 1000 })(
		'stays within the queue and never decreases as the pointer moves down',
		({ from, midpoints: rowMidpoints, pointers }) => {
			const [higher, lower] = pointers;
			const upper = dropIndex(rowMidpoints, from, higher);
			const below = dropIndex(rowMidpoints, from, lower);

			for (const landing of [upper, below]) {
				expect(landing).toBeGreaterThanOrEqual(0);
				expect(landing).toBeLessThanOrEqual(rowMidpoints.length - 1);
			}

			expect(below).toBeGreaterThanOrEqual(upper);
		},
	);

	test('lands where the pointer sits when nothing has been crossed', () => {
		expect(dropIndex(midpoints, 2, 10)).toBe(0);
	});

	test('discounts the dragged row once the pointer is below it', () => {
		expect(dropIndex(midpoints, 0, 70)).toBe(1);
		expect(dropIndex(midpoints, 0, 110)).toBe(2);
	});

	test('counts every row above the pointer when dragging upward', () => {
		expect(dropIndex(midpoints, 3, 70)).toBe(2);
		expect(dropIndex(midpoints, 3, 30)).toBe(1);
	});

	test('holds its place while the pointer stays inside the dragged row', () => {
		expect(dropIndex(midpoints, 1, 55)).toBe(1);
		expect(dropIndex(midpoints, 1, 65)).toBe(1);
	});

	test('clamps to the last row past the end of the list', () => {
		expect(dropIndex(midpoints, 0, 400)).toBe(3);
	});
});
