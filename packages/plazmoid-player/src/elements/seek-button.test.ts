import { afterEach, describe, expect, test } from 'vitest';

import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-seek-button>', () => {
	test('stays disabled until a track is loaded, and again once the queue clears', () => {
		const { part, store } = mount('pzm-seek-button', { attributes: { seconds: '-30' } });
		const isDisabled = () => part.querySelector('sonic-button')?.softDisabled;

		expect(isDisabled()).toBe(true);

		store.getState().playTrack([sampleTrack('a')], 'a');

		expect(isDisabled()).toBe(false);

		store.getState().clearQueue();

		expect(isDisabled()).toBe(true);
	});
});
