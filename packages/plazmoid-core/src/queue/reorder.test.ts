import { describe, expect, test } from 'vitest';

import { canMove, movedArray, movedIndex } from '#queue/reorder.ts';

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
