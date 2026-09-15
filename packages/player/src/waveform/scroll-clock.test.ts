import { describe, expect, test } from 'vitest';

import type { SubscribeTime } from '#types.ts';

import { createScrollClock } from '#waveform/scroll-clock.ts';

const noStoreTime: SubscribeTime = () => unsubscribeNothing;

function clockOver(elementTime: () => number, outputDelaySeconds: number) {
	return createScrollClock({
		elementTime,
		outputDelay: () => outputDelaySeconds,
		subscribeTime: noStoreTime,
	});
}

function unsubscribeNothing(): void {
	// The clock under test reads the element, so no store stands behind it
}

describe('createScrollClock', () => {
	test('reads what is audible, which trails the element by the output delay', () => {
		expect(clockOver(() => 60, 0.05).read(0, false)).toBeCloseTo(59.95);
	});

	test('never reads before the start of the track', () => {
		expect(clockOver(() => 0.01, 0.05).read(0, false)).toBe(0);
	});

	test('sends an audible position back to the element clock that produced it', () => {
		const clock = clockOver(() => 60, 0.05);

		expect(clock.toElementSeconds(clock.read(0, false))).toBeCloseTo(60);
	});

	test('snaps across a seek rather than sliding through the span between', () => {
		let elementSeconds = 10;
		const clock = clockOver(() => elementSeconds, 0);

		clock.read(0, true);
		elementSeconds = 100;

		expect(clock.read(16, true)).toBe(100);
	});
});
