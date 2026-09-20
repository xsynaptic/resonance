import { describe, expect, test } from 'vitest';

import { parseTimestampSeconds, TimestampSchema } from '#schemas/timestamp.ts';

describe('TimestampSchema', () => {
	test.each(['00:00:00.00', '00:13:03.84', '27:59:59.99'])('accepts %s', (value) => {
		expect(TimestampSchema.safeParse(value).success).toBe(true);
	});

	test.each([
		'00:13:03',
		'00:57:15.5',
		'00:13:03.847',
		'0:13:03.84',
		'00:60:03.84',
		'00:13:60.84',
		'00:13:03:84',
	])('rejects %s', (value) => {
		expect(TimestampSchema.safeParse(value).success).toBe(false);
	});
});

describe('parseTimestampSeconds', () => {
	test.each([
		['00:00:00.00', 0],
		['00:13:03.84', 783.84],
		['04:03:16.78', 14_596.78],
	])('reads %s as %d seconds', (value, expected) => {
		expect(parseTimestampSeconds(value)).toBe(expected);
	});

	test('returns undefined for a value the schema would reject', () => {
		expect(parseTimestampSeconds('00:13:03')).toBeUndefined();
	});
});
