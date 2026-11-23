import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { defaultLabels } from '#labels.ts';
import { mount } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-mute-button>', () => {
	test('names the press for what it does next', () => {
		const { part, store } = mount('pzm-mute-button');

		getByRole(part, 'button', { name: defaultLabels.mute }).click();

		expect(store.getState().isMuted).toBe(true);
		expect(getByRole(part, 'button', { name: defaultLabels.unmute })).toBeDefined();

		store.getState().setVolume(0.3);

		expect(getByRole(part, 'button', { name: defaultLabels.mute })).toBeDefined();
	});

	test('reads a fader dragged to zero as muted', () => {
		const { part, store } = mount('pzm-mute-button');

		store.getState().setVolume(0);

		expect(getByRole(part, 'button', { name: defaultLabels.unmute })).toBeDefined();
	});
});
