import { describe, expect, test } from 'vitest';

import { formatClock } from '#lib/format.ts';

describe('formatClock', () => {
	test('pads the seconds and leaves the minutes bare', () => {
		expect(formatClock(0)).toBe('0:00');
		expect(formatClock(64)).toBe('1:04');
		expect(formatClock(1924)).toBe('32:04');
	});

	test('counts minutes past the hour rather than rolling over', () => {
		expect(formatClock(7056)).toBe('117:36');
	});

	test('carries a leading sign for a remaining time', () => {
		expect(formatClock(-5132)).toBe('-85:32');
		expect(formatClock(-0.4)).toBe('-0:00');
	});

	test('floors a fraction rather than rounding it up', () => {
		expect(formatClock(59.9)).toBe('0:59');
	});

	test('falls back on a value that is not a number of seconds', () => {
		expect(formatClock(NaN)).toBe('0:00');
		expect(formatClock(Infinity)).toBe('0:00');
	});
});
