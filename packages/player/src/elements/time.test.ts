import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#components/test-labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-time>', () => {
	test('reads --:--, disabled, until the duration is known', () => {
		const { fake, part, store } = mount('player-time');
		const clock = getByRole(part, 'button', { name: labels.toggleTimeMode });

		expect(clock.textContent).toBe('--:--');
		expect(clock.hasAttribute('disabled')).toBe(true);

		store.getState().playTrack([queueItem('a')], 'a');
		fake.callbacks.current?.onTime(64);

		expect(clock.textContent).toBe('--:--');

		fake.callbacks.current?.onDuration(180);

		expect(clock.textContent).toBe('1:04');
		expect(clock.hasAttribute('disabled')).toBe(false);
	});

	test('flips between elapsed and remaining', () => {
		const { fake, part, store } = mount('player-time');

		store.getState().playTrack([queueItem('a', { durationMs: 180_000 })], 'a');
		fake.callbacks.current?.onTime(64);

		const clock = getByRole(part, 'button', { name: labels.toggleTimeMode });

		expect(clock.textContent).toBe('1:04');
		expect(clock.getAttribute('aria-pressed')).toBe('false');

		clock.click();

		expect(clock.textContent).toBe('-1:56');
		expect(clock.dataset.mode).toBe('remaining');
		expect(clock.getAttribute('aria-pressed')).toBe('true');
	});
});
