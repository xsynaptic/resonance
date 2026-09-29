import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount } from '#test/mount.ts';

const volumeMock = vi.hoisted(() => ({ canSet: true }));

vi.mock('#lib/can-set-volume.ts', () => ({
	canSetVolume: () => volumeMock.canSet,
}));

afterEach(() => {
	document.body.replaceChildren();
	volumeMock.canSet = true;
});

describe('<player-volume>', () => {
	test('holds the level through a mute, dimmed', () => {
		const { part, store } = mount('player-volume');

		store.getState().setVolume(0.3);
		getByRole(part, 'button', { name: labels.mute }).click();

		expect(getByRole(part, 'slider', { name: labels.volume }).getAttribute('aria-valuenow')).toBe(
			'0.3',
		);
		expect(part.querySelector('sonic-dial')?.hasAttribute('dimmed')).toBe(true);
	});

	test('unmutes at the new level when the dial turns', () => {
		const { part, store } = mount('player-volume');

		store.getState().setVolume(0.3);
		store.getState().toggleMuted();
		fireEvent.keyDown(getByRole(part, 'slider', { name: labels.volume }), { key: 'ArrowUp' });

		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.31 });
		expect(part.querySelector('sonic-dial')?.hasAttribute('dimmed')).toBe(false);
	});

	test('leaves only the mute where volume is read-only', () => {
		volumeMock.canSet = false;

		const { part } = mount('player-volume');

		expect(queryByRole(part, 'slider')).toBeNull();
		expect(getByRole(part, 'button', { name: labels.mute })).toBeDefined();
	});
});
