import { describe, expect, test } from 'vitest';

import { formatClock, formatTemplate } from '#lib/format.ts';

describe('formatClock', () => {
	test('pads the seconds and leaves the minutes bare', () => {
		expect(formatClock(0)).toBe('0:00');
		expect(formatClock(64)).toBe('1:04');
		expect(formatClock(1924)).toBe('32:04');
	});

	test('rolls minutes over into hours at the hour', () => {
		expect(formatClock(3599)).toBe('59:59');
		expect(formatClock(3600)).toBe('1:00:00');
		expect(formatClock(7612)).toBe('2:06:52');
	});

	test('carries a leading sign for a remaining time', () => {
		expect(formatClock(-5132)).toBe('-1:25:32');
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

describe('formatTemplate', () => {
	test('fills in every placeholder it is given', () => {
		expect(
			formatTemplate('Moved to position {position} of {total}', { position: 3, total: 7 }),
		).toBe('Moved to position 3 of 7');
	});

	test('empties a placeholder with no value', () => {
		expect(formatTemplate('{missing}!', {})).toBe('!');
	});
});
