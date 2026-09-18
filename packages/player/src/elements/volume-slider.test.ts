import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { mount } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-volume-slider>', () => {
	test('rests at zero while muted', () => {
		const { part, store } = mount('player-volume-slider');

		store.getState().toggleMuted();

		expect(getByRole(part, 'slider').getAttribute('aria-valuetext')).toBe('0%');
	});
});
