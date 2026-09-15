import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-mute-button>', () => {
	test('names the press for what it does next', () => {
		const { part, store } = mount('player-mute-button');

		getByRole(part, 'button', { name: labels.mute }).click();

		expect(store.getState().isMuted).toBe(true);

		store.getState().setVolume(0.3);

		expect(getByRole(part, 'button', { name: labels.mute })).toBeDefined();
	});

	test('reads a fader dragged to zero as muted', () => {
		const { part, store } = mount('player-mute-button');

		store.getState().setVolume(0);

		expect(getByRole(part, 'button', { name: labels.unmute })).toBeDefined();
	});
});
