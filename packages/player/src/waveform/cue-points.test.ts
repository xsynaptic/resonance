import { describe, expect, test } from 'vitest';

import { cueIndexAt, labelPlacement } from '#waveform/cue-points.ts';

function cue(startSeconds: number) {
	return { artistLine: '', startSeconds, title: String(startSeconds) };
}

describe('cueIndexAt', () => {
	const cuePoints = [cue(30), cue(90), cue(150)];

	test('answers -1 before the first timestamp', () => {
		expect(cueIndexAt(cuePoints, 29.9)).toBe(-1);
	});

	test('takes a cue from its own timestamp onward', () => {
		expect(cueIndexAt(cuePoints, 90)).toBe(1);
		expect(cueIndexAt(cuePoints, 149.9)).toBe(1);
	});
});

describe('labelPlacement', () => {
	test('opens rightward over the first 60% and leftward past that, with the room left on that side', () => {
		expect(labelPlacement(100, 300)).toEqual({ room: 200, side: 'start' });
		expect(labelPlacement(200, 300)).toEqual({ room: 200, side: 'end' });
	});
});
