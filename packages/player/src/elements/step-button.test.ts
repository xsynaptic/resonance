import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#components/test-labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-step-button>', () => {
	test('keeps focus on next once its own press leaves nothing after the current track', () => {
		const { part, store } = mount('player-step-button', { direction: 'next' });

		store.getState().playTrack([queueItem('a'), queueItem('b')], 'a');

		const next = getByRole(part, 'button', { name: labels.next });

		next.focus();
		next.click();

		expect(store.getState().currentIndex).toBe(1);
		expect(next.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(next);

		next.click();

		expect(store.getState().currentIndex).toBe(1);
	});

	test('steps back once there is somewhere to go', () => {
		const { part, store } = mount('player-step-button', { direction: 'previous' });
		const previous = getByRole(part, 'button', { name: labels.previous });

		expect(previous.getAttribute('aria-disabled')).toBe('true');

		store.getState().playTrack([queueItem('a'), queueItem('b')], 'b');

		expect(previous.getAttribute('aria-disabled')).toBe('false');

		previous.click();

		expect(store.getState().currentIndex).toBe(0);
	});
});
