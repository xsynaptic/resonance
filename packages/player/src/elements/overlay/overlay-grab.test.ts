import { describe, expect, test } from 'vitest';

import { isDismissed } from '#elements/overlay/overlay-grab.ts';

describe('isDismissed', () => {
	test('dismisses from a quarter of the sheet', () => {
		expect(isDismissed({ heightPx: 800, travelPx: 200, velocityPxPerMs: 0 })).toBe(true);
		expect(isDismissed({ heightPx: 800, travelPx: 199, velocityPxPerMs: 0 })).toBe(false);
	});

	test('dismisses on a flick that travelled hardly at all', () => {
		expect(isDismissed({ heightPx: 800, travelPx: 12, velocityPxPerMs: 0.8 })).toBe(true);
	});

	test('holds a flick that ended back where it started', () => {
		expect(isDismissed({ heightPx: 800, travelPx: 0, velocityPxPerMs: 1.2 })).toBe(false);
	});
});
