import { describe, expect, test } from 'vitest';

import { identityOrder, nextInOrder, previousInOrder, shuffledOrder } from '#queue/queue.ts';

const zeroRandom = () => 0;

const ascending = (first: number, second: number) => first - second;

describe('identityOrder', () => {
	test('is the queue positions in sequence', () => {
		expect(identityOrder(3)).toStrictEqual([0, 1, 2]);
		expect(identityOrder(0)).toStrictEqual([]);
	});
});

describe('shuffledOrder', () => {
	test('puts the current track first', () => {
		expect(shuffledOrder(4, 2, zeroRandom)[0]).toBe(2);
	});

	test('is a permutation of every queue index', () => {
		expect(shuffledOrder(5, 1, zeroRandom).toSorted(ascending)).toStrictEqual([0, 1, 2, 3, 4]);
	});

	test('shuffles from the head when nothing is current', () => {
		const order = shuffledOrder(3, undefined, zeroRandom);

		expect(order.toSorted(ascending)).toStrictEqual([0, 1, 2]);
		expect(order).toHaveLength(3);
	});
});

describe('nextInOrder', () => {
	test('advances along the play order, not the queue', () => {
		expect(nextInOrder([2, 0, 1], 2)).toBe(0);
		expect(nextInOrder([2, 0, 1], 0)).toBe(1);
	});

	test('returns undefined at the end without wrapping', () => {
		expect(nextInOrder([2, 0, 1], 1)).toBeUndefined();
	});

	test('returns undefined when the current index is not in the order', () => {
		expect(nextInOrder([0, 1], 5)).toBeUndefined();
	});
});

describe('previousInOrder', () => {
	test('steps back along the play order', () => {
		expect(previousInOrder([2, 0, 1], 0)).toBe(2);
		expect(previousInOrder([2, 0, 1], 1)).toBe(0);
	});

	test('returns undefined at the head', () => {
		expect(previousInOrder([2, 0, 1], 2)).toBeUndefined();
	});
});
