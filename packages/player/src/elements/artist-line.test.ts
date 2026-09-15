import { getByText } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-artist-line>', () => {
	test('names the artist, and hides while nothing is queued', () => {
		const { part, store } = mount('player-artist-line');

		expect(part.hidden).toBe(true);

		store.getState().loadQueue([queueItem('a')]);

		expect(part.hidden).toBe(false);
		expect(getByText(part, 'Forest Signal').closest('.player-marquee')?.className).toBe(
			'player-marquee player-track-artist',
		);
	});
});
