import { describe, expect, test } from 'vitest';

import { layoutCueDots } from '#waveform/cue-dots.ts';

// 300px wide at a 3px pitch: 100 columns, one per second of a 100-second mix, centred 1px into each 2px bar
const grid = { bar: 2, count: 100, pitch: 3, width: 300 };

function cue(startSeconds: number) {
	return { artistLine: '', startSeconds, title: String(startSeconds) };
}

describe('layoutCueDots', () => {
	test('centres each dot on the bar its timestamp falls in', () => {
		const dots = layoutCueDots([cue(0), cue(10.9), cue(99.5)], 100, grid);

		expect(dots.map((dot) => dot.left)).toEqual([1, 31, 298]);
	});

	test('clamps a timestamp past the end onto the last column', () => {
		const [dot] = layoutCueDots([cue(140)], 100, grid);

		expect(dot?.left).toBe(298);
	});

	test('opens labels rightward over the first two thirds and leftward past that', () => {
		const dots = layoutCueDots([cue(0), cue(66), cue(67)], 100, grid);

		expect(dots.map((dot) => dot.side)).toEqual(['start', 'start', 'end']);
	});

	test('measures the room a label has toward the edge it opens to', () => {
		const dots = layoutCueDots([cue(10), cue(90)], 100, grid);

		expect(dots.map((dot) => dot.room)).toEqual([269, 271]);
	});

	test('drops a dot to the next row when it would touch the last one on its row', () => {
		const dots = layoutCueDots([cue(10), cue(11), cue(11.5), cue(12), cue(20)], 100, grid);

		expect(dots.map((dot) => dot.lane)).toEqual([0, 1, 2, 0, 0]);
	});
});
