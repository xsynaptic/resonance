import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { canMove, dropIndex, movedArray, movedIndex } from '#queue/reorder.ts';

// Four rows 40px tall from a list scrolled to the top
const midpoints = [20, 60, 100, 140];

describe('canMove', () => {
	test('accepts a move between two rows of the queue', () => {
		expect(canMove(4, 0, 3)).toBe(true);
		expect(canMove(4, 3, 0)).toBe(true);
	});

	test('refuses a move that goes nowhere', () => {
		expect(canMove(4, 2, 2)).toBe(false);
	});

	test('refuses an end outside the queue', () => {
		expect(canMove(4, -1, 2)).toBe(false);
		expect(canMove(4, 4, 2)).toBe(false);
		expect(canMove(4, 2, -1)).toBe(false);
		expect(canMove(4, 2, 4)).toBe(false);
	});
});

describe('movedArray', () => {
	test('moves an item down', () => {
		expect(movedArray(['a', 'b', 'c', 'd'], 0, 2)).toStrictEqual(['b', 'c', 'a', 'd']);
	});

	test('moves an item up', () => {
		expect(movedArray(['a', 'b', 'c', 'd'], 3, 1)).toStrictEqual(['a', 'd', 'b', 'c']);
	});
});

describe('movedIndex', () => {
	test('shifts the items a downward move passes down one place', () => {
		expect(movedIndex(1, 0, 2)).toBe(0);
		expect(movedIndex(2, 0, 2)).toBe(1);
	});

	test('shifts the items an upward move passes up one place', () => {
		expect(movedIndex(1, 3, 1)).toBe(2);
		expect(movedIndex(2, 3, 1)).toBe(3);
	});

	test('agrees with the array it describes', () => {
		const items = ['a', 'b', 'c', 'd'];
		const moved = movedArray(items, 1, 3);

		for (const [index, item] of items.entries()) {
			expect(moved[movedIndex(index, 1, 3)]).toBe(item);
		}
	});
});

const longestQueueChecked = 8;

function indicesUpTo(length: number): Array<number> {
	return Array.from({ length }, (_, index) => index);
}

function everyMoveCanMoveAccepts() {
	const moves: Array<{ from: number; length: number; to: number }> = [];

	for (let length = 1; length <= longestQueueChecked; length += 1) {
		const indices = indicesUpTo(length);

		for (const from of indices) {
			const accepted = indices.filter((to) => canMove(length, from, to));

			moves.push(...accepted.map((to) => ({ from, length, to })));
		}
	}

	return moves;
}

const byText = (first: string, second: string) => first.localeCompare(second);

describe('movedArray against movedIndex', () => {
	test('permutes its input and lands every item where movedIndex says, for every move canMove accepts', () => {
		const moves = everyMoveCanMoveAccepts();

		expect(moves).toHaveLength(168);

		for (const { from, length, to } of moves) {
			const items = Array.from({ length }, (_, index) => `item-${String(index)}`);
			const moved = movedArray(items, from, to);

			expect(moved.toSorted(byText)).toStrictEqual(items.toSorted(byText));

			for (const [index, item] of items.entries()) {
				expect(moved[movedIndex(index, from, to)], JSON.stringify({ from, length, to })).toBe(item);
			}
		}
	});
});

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
