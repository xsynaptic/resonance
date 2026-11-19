import { afterEach, describe, expect, test } from 'vitest';

import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-seek-button>', () => {
	test('stays disabled until a track is loaded, and again once the queue clears', () => {
		const { part, store } = mount('player-seek-button', { attributes: { seconds: '-30' } });
		const isDisabled = () => part.querySelector('sonic-button')?.disabled;

		expect(isDisabled()).toBe(true);

		store.getState().playTrack([queueItem('a')], 'a');

		expect(isDisabled()).toBe(false);

		store.getState().clearQueue();

		expect(isDisabled()).toBe(true);
	});
});
