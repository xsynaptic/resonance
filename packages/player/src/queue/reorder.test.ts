import { describe, expect, test } from 'vitest';

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

	test('leaves the array alone when the item does not move', () => {
		expect(movedArray(['a', 'b', 'c'], 1, 1)).toStrictEqual(['a', 'b', 'c']);
	});
});

describe('movedIndex', () => {
	test('follows the moved item to its destination', () => {
		expect(movedIndex(0, 0, 2)).toBe(2);
		expect(movedIndex(3, 3, 1)).toBe(1);
	});

	test('shifts the items a downward move passes down one place', () => {
		expect(movedIndex(1, 0, 2)).toBe(0);
		expect(movedIndex(2, 0, 2)).toBe(1);
	});

	test('shifts the items an upward move passes up one place', () => {
		expect(movedIndex(1, 3, 1)).toBe(2);
		expect(movedIndex(2, 3, 1)).toBe(3);
	});

	test('leaves the items outside the move alone', () => {
		expect(movedIndex(3, 0, 2)).toBe(3);
		expect(movedIndex(0, 3, 1)).toBe(0);
	});

	test('agrees with the array it describes', () => {
		const items = ['a', 'b', 'c', 'd'];
		const moved = movedArray(items, 1, 3);

		for (const [index, item] of items.entries()) {
			expect(moved[movedIndex(index, 1, 3)]).toBe(item);
		}
	});
});

describe('dropIndex', () => {
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
