import { fireEvent, getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#components/test-labels.ts';
import { mount } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-volume-slider>', () => {
	test('reports a drag to the store', () => {
		const { part, store } = mount('player-volume-slider');

		fireEvent.input(getByRole(part, 'slider', { name: labels.volume }), {
			target: { value: '0.4' },
		});

		expect(store.getState().volume).toBe(0.4);
	});

	test('names the level as a percentage and paints it', () => {
		const { part, store } = mount('player-volume-slider');
		const slider = getByRole(part, 'slider', { name: labels.volume });

		store.getState().setVolume(0.37);

		expect(slider.getAttribute('aria-valuetext')).toBe('37%');
		expect(slider.style.getPropertyValue('--player-volume-level')).toBe('37%');
	});

	test('rests at zero while muted', () => {
		const { part, store } = mount('player-volume-slider');

		store.getState().toggleMuted();

		expect(getByRole(part, 'slider').getAttribute('aria-valuetext')).toBe('0%');
	});
});
