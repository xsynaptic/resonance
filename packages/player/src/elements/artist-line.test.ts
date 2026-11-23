import { afterEach, describe, expect, test } from 'vitest';

import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-artist-line>', () => {
	test('shows only while there is an artist line to show', () => {
		const { part, store } = mount('pzm-artist-line');

		expect(part.hidden).toBe(true);

		store.getState().playTrack([sampleTrack('a')], 'a');

		expect(part.hidden).toBe(false);
		expect(part.textContent).toContain('Forest Signal');

		store.getState().clearQueue();

		expect(part.hidden).toBe(true);
	});
});
