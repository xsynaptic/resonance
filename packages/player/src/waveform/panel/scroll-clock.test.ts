import { describe, expect, test } from 'vitest';

import type { SubscribeTime } from '#types.ts';

import { createScrollClock } from '#waveform/panel/scroll-clock.ts';

const noStoreTime: SubscribeTime = () => unsubscribeNothing;

function clockOver(elementTime: () => number) {
	return createScrollClock({ elementTime, subscribeTime: noStoreTime });
}

function unsubscribeNothing(): void {
	// The clock under test reads the element, so no store stands behind it
}

describe('createScrollClock', () => {
	test('snaps across a seek rather than sliding through the span between', () => {
		let elementSeconds = 10;
		const clock = clockOver(() => elementSeconds);

		clock.read(0, true);
		elementSeconds = 100;

		expect(clock.read(16, true)).toBe(100);
	});
});
