import { describe, expect, test } from 'vitest';

import { formatClock, formatTemplate } from '#lib/format.ts';

describe('formatClock', () => {
	test('rolls minutes over into hours at the hour', () => {
		expect(formatClock(3599)).toBe('59:59');
		expect(formatClock(3600)).toBe('1:00:00');
		expect(formatClock(7612)).toBe('2:06:52');
	});

	test('carries a leading sign for a remaining time', () => {
		expect(formatClock(-5132)).toBe('-1:25:32');
		expect(formatClock(-0.4)).toBe('-0:00');
	});

	test('falls back on a value that is not a number of seconds', () => {
		expect(formatClock(NaN)).toBe('0:00');
		expect(formatClock(Infinity)).toBe('0:00');
	});
});

describe('formatTemplate', () => {
	test('empties a placeholder with no value', () => {
		expect(formatTemplate('{missing}!', {})).toBe('!');
	});
});
