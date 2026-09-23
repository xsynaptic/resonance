import { afterEach, describe, expect, test } from 'vitest';

import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function progressOf(part: HTMLElement): string {
	return (
		part
			.querySelector<HTMLElement>('.player-progress')
			?.style.getPropertyValue('--player-progress') ?? ''
	);
}

describe('<player-progress>', () => {
	test('follows the position as a share of the duration, and reads nothing before either is known', () => {
		const { fake, part, store } = mount('player-progress');

		expect(progressOf(part)).toBe('0');

		store.getState().playTrack([queueItem('a')], 'a');
		fake.callbacks.current?.onTime(45);

		expect(progressOf(part)).toBe('0');

		fake.callbacks.current?.onDuration(180);

		expect(progressOf(part)).toBe('0.25');

		store.getState().clearQueue();

		expect(progressOf(part)).toBe('0');
	});
});
