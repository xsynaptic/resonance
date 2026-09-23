import { getAllByRole, getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount } from '#test/mount.ts';

const volumeMock = vi.hoisted(() => ({ canSet: true }));

vi.mock('#lib/can-set-volume.ts', () => ({
	canSetVolume: () => volumeMock.canSet,
}));

function controlOf(part: HTMLElement): HTMLElement {
	const control = part.querySelector<HTMLElement>('.player-volume');
	if (!control) throw new Error('The popover rendered no control');

	return control;
}

// Stubbed before the mount, since the popover reads the query as it connects
function stubHover(canHover: boolean) {
	const listeners = new Set<() => void>();
	const query = {
		addEventListener: (_type: string, listener: () => void) => {
			listeners.add(listener);
		},
		matches: canHover,
	};

	vi.stubGlobal('matchMedia', () => query);

	return {
		flip: (canHoverNext: boolean) => {
			query.matches = canHoverNext;
			for (const listener of listeners) listener();
		},
	};
}

afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
	volumeMock.canSet = true;
});

describe('<player-volume-popover>', () => {
	test('opens the panel on a click where the pointer cannot hover, with mute moved inside', () => {
		stubHover(false);

		const { part, store } = mount('player-volume-popover');
		const trigger = getByRole(part, 'button', { name: labels.volume });

		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(getByRole(part, 'button', { name: labels.mute })).toBeDefined();

		trigger.click();

		expect(controlOf(part).dataset.open).toBe('');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(store.getState().volume).toBe(1);
	});

	test('comes back closed after a reconnect', async () => {
		stubHover(false);

		const { part, root } = mount('player-volume-popover');

		getByRole(part, 'button', { name: labels.volume }).click();

		expect(controlOf(part).dataset.open).toBe('');

		root.remove();
		await Promise.resolve();
		document.body.append(root);

		expect(controlOf(part).dataset.open).toBeUndefined();
	});

	test('stays open across a move within one task', () => {
		stubHover(false);

		const { part, root } = mount('player-volume-popover');

		getByRole(part, 'button', { name: labels.volume }).click();
		document.documentElement.append(root);
		document.body.append(root);

		expect(controlOf(part).dataset.open).toBe('');
	});

	test('gives up the slider and mutes from the trigger where volume is read-only', () => {
		volumeMock.canSet = false;
		stubHover(false);

		const { part, store } = mount('player-volume-popover');
		const trigger = getByRole(part, 'button', { name: labels.mute });

		expect(getAllByRole(part, 'button')).toHaveLength(1);
		expect(controlOf(part).dataset.muteOnly).toBe('');
		expect(trigger.hasAttribute('aria-expanded')).toBe(false);

		trigger.click();

		expect(store.getState().isMuted).toBe(true);
		expect(controlOf(part).dataset.open).toBeUndefined();
	});

	test('follows the pointer when the hover answer changes', () => {
		const hover = stubHover(false);
		const { part } = mount('player-volume-popover');

		expect(getAllByRole(part, 'button')).toHaveLength(2);

		hover.flip(true);

		expect(getAllByRole(part, 'button')).toHaveLength(1);
		expect(getByRole(part, 'button', { name: labels.mute }).hasAttribute('aria-expanded')).toBe(
			false,
		);
	});
});
