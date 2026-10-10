import { describe, expect, test } from 'vitest';

import { cueIndexAt } from '#queue/cue-points.ts';

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
