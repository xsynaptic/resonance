import { afterEach, describe, expect, test } from 'vitest';

import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-artist-line>', () => {
	test('shows only while there is an artist line to show', () => {
		const { part, store } = mount('player-artist-line');

		expect(part.hidden).toBe(true);

		store.getState().playTrack([queueItem('a')], 'a');

		expect(part.hidden).toBe(false);
		expect(part.textContent).toContain('Forest Signal');

		store.getState().clearQueue();

		expect(part.hidden).toBe(true);
	});
});
