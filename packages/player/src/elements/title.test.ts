import { getByRole, getByText, queryByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-title>', () => {
	test('links the title to its release, and renders it as text without one', () => {
		const { part, store } = mount('pzm-title');

		store.getState().playTrack([sampleTrack('a', { releaseHref: '/releases/a' })], 'a');

		expect(getByRole(part, 'link', { name: 'Mix a' }).getAttribute('href')).toBe('/releases/a');

		store.getState().playTrack([sampleTrack('b')], 'b');

		expect(queryByRole(part, 'link')).toBeNull();
		expect(getByText(part, 'Mix b').closest('.pzm-track-title')?.localName).toBe('span');
		expect(part.querySelectorAll('sonic-ticker')).toHaveLength(1);
	});
});
