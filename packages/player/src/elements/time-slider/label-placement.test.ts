import { expect, test } from 'vitest';

import { labelPlacement } from '#elements/time-slider/label-placement.ts';

test('opens rightward over the first 60% and leftward past that, with the room left on that side', () => {
	expect(labelPlacement(100, 300)).toEqual({ room: 200, side: 'start' });
	expect(labelPlacement(200, 300)).toEqual({ room: 200, side: 'end' });
});
