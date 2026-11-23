import { fc, test } from '@fast-check/vitest';
import { parseClock } from '@xsynaptic/sonic-ui';
import { describe, expect } from 'vitest';

import { formatModeClock, formatTemplate } from '#lib/format.ts';

const threeHoursInSeconds = 10_800;

const finiteDurationFromTheEngineUpToThreeHours = fc.oneof(
	fc.double({ max: threeHoursInSeconds, min: 0, noDefaultInfinity: true, noNaN: true }),
	fc.integer({ max: threeHoursInSeconds, min: 0 }),
);

const durationWithNonNegativeMediaPosition = finiteDurationFromTheEngineUpToThreeHours.chain(
	(durationSeconds) =>
		fc.record({
			durationSeconds: fc.constant(durationSeconds),
			seconds: fc.oneof(
				fc.double({ max: durationSeconds + 5, min: 0, noDefaultInfinity: true, noNaN: true }),
				fc.integer({ max: Math.floor(durationSeconds) + 5, min: 0 }),
				fc.constant(durationSeconds),
			),
		}),
);

function readouts(seconds: number, durationSeconds: number) {
	return {
		elapsed: formatModeClock(seconds, { durationSeconds, timeMode: 'elapsed' }),
		remaining: formatModeClock(seconds, { durationSeconds, timeMode: 'remaining' }),
	};
}

describe('formatModeClock', () => {
	test.prop([durationWithNonNegativeMediaPosition], { numRuns: 1000 })(
		'adds elapsed and remaining up to the shown length, never reads remaining above zero, and reads 0:00 from the end on',
		({ durationSeconds, seconds }) => {
			const { elapsed, remaining } = readouts(seconds, durationSeconds);
			const shownLength = parseClock(
				formatModeClock(durationSeconds, { durationSeconds, timeMode: 'elapsed' }),
			);

			expect(parseClock(remaining)).toBeLessThanOrEqual(0);

			if (seconds <= durationSeconds) {
				expect(parseClock(elapsed) - parseClock(remaining)).toBe(shownLength);
			}

			if (seconds >= durationSeconds) {
				expect(remaining).toBe('0:00');
			}
		},
	);

	test.each([
		{ durationSeconds: 180, elapsed: '0:00', remaining: '−3:00', seconds: 0 },
		{ durationSeconds: 180, elapsed: '0:00', remaining: '−3:00', seconds: 0.5 },
		{ durationSeconds: 180, elapsed: '0:59', remaining: '−2:01', seconds: 59.999 },
		{ durationSeconds: 180, elapsed: '2:59', remaining: '−0:01', seconds: 179.5 },
		{ durationSeconds: 180, elapsed: '3:00', remaining: '0:00', seconds: 180 },
		{ durationSeconds: 180, elapsed: '3:05', remaining: '0:00', seconds: 185 },
		{ durationSeconds: 180.7, elapsed: '3:00', remaining: '0:00', seconds: 180.7 },
		{ durationSeconds: 180.7, elapsed: '3:00', remaining: '0:00', seconds: 180.2 },
	])(
		'reads $elapsed and $remaining at $seconds into $durationSeconds',
		({ durationSeconds, elapsed, remaining, seconds }) => {
			expect(readouts(seconds, durationSeconds)).toStrictEqual({ elapsed, remaining });
		},
	);
});

describe('formatTemplate', () => {
	test('empties a placeholder with no value', () => {
		expect(formatTemplate('{missing}!', {})).toBe('!');
	});
});
