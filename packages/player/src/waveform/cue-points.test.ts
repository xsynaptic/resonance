import { describe, expect, test } from 'vitest';

import { cueIndexAt, cuePointAt, layoutCuePoints } from '#waveform/cue-points.ts';

// 300 device pixels at a 3px pitch: 100 columns, one per second of a 100-second mix, centred 1px into each 2px bar
const grid = { bar: 2, count: 100, pitch: 3, ratio: 1, size: 4, width: 300 };

function cue(startSeconds: number) {
	return { artistLine: '', startSeconds, title: String(startSeconds) };
}

describe('layoutCuePoints', () => {
	test('centres each cue point on the bar its timestamp falls in', () => {
		const placed = layoutCuePoints([cue(0), cue(10.9), cue(99.5)], 100, grid);

		expect(placed.map((cuePoint) => cuePoint.x)).toEqual([1, 31, 298]);
	});

	test('clamps a timestamp past the end onto the last column', () => {
		const [cuePoint] = layoutCuePoints([cue(140)], 100, grid);

		expect(cuePoint?.x).toBe(298);
	});

	test('opens labels rightward over the first two thirds and leftward past that', () => {
		const placed = layoutCuePoints([cue(0), cue(66), cue(67)], 100, grid);

		expect(placed.map((cuePoint) => cuePoint.side)).toEqual(['start', 'start', 'end']);
	});

	test('measures the room a label has toward the edge it opens to', () => {
		const placed = layoutCuePoints([cue(10), cue(90)], 100, grid);

		expect(placed.map((cuePoint) => cuePoint.room)).toEqual([269, 271]);
	});

	test('drops a cue point to the next row when it would touch the last one on its row', () => {
		const placed = layoutCuePoints([cue(10), cue(11), cue(11.5), cue(12), cue(20)], 100, grid);

		expect(placed.map((cuePoint) => cuePoint.lane)).toEqual([0, 1, 2, 0, 0]);
		expect(placed.map((cuePoint) => cuePoint.y)).toEqual([2, 7, 12, 2, 2]);
	});
});

describe('cueIndexAt', () => {
	const cuePoints = [cue(30), cue(90), cue(150)];

	test('answers -1 before the first timestamp', () => {
		expect(cueIndexAt(cuePoints, 29.9)).toBe(-1);
	});

	test('takes a cue from its own timestamp onward', () => {
		expect(cueIndexAt(cuePoints, 90)).toBe(1);
		expect(cueIndexAt(cuePoints, 149.9)).toBe(1);
	});

	test('holds the last cue past its timestamp', () => {
		expect(cueIndexAt(cuePoints, 4000)).toBe(2);
	});
});

describe('cuePointAt', () => {
	const placed = layoutCuePoints([cue(10), cue(11)], 100, grid);

	test('finds a cue point within the hit radius and nothing past it', () => {
		expect(cuePointAt(placed, { x: 31, y: 2 }, 6)?.cuePoint.startSeconds).toBe(10);
		expect(cuePointAt(placed, { x: 38, y: 2 }, 6)).toBeUndefined();
	});

	test('takes the nearer of two stacked cue points', () => {
		expect(cuePointAt(placed, { x: 33, y: 6 }, 6)?.cuePoint.startSeconds).toBe(11);
	});
});
