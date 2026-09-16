import { fireEvent, getAllByRole, getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount } from '#test/mount.ts';

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
});

describe('<player-volume-popover>', () => {
	test('mutes on a click where the panel already opens on hover', () => {
		stubHover(true);

		const { part, store } = mount('player-volume-popover');

		getByRole(part, 'button', { name: labels.mute }).click();

		expect(store.getState().isMuted).toBe(true);
		expect(controlOf(part).dataset.open).toBeUndefined();
		expect(getByRole(part, 'button', { name: labels.unmute }).hasAttribute('aria-expanded')).toBe(
			false,
		);
	});

	test('leaves the panel to the slider alone where the trigger mutes', () => {
		stubHover(true);

		const { part } = mount('player-volume-popover');

		expect(getAllByRole(part, 'button')).toHaveLength(1);
	});

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

	test('closes on Escape and hands focus back to the trigger', () => {
		stubHover(false);

		const { part } = mount('player-volume-popover');
		const trigger = getByRole(part, 'button', { name: labels.volume });

		trigger.click();
		fireEvent.keyDown(getByRole(part, 'slider', { name: labels.volume }), { key: 'Escape' });

		expect(controlOf(part).dataset.open).toBeUndefined();
		expect(document.activeElement).toBe(trigger);
	});

	test('closes on a click outside the control and not on one inside it', () => {
		stubHover(false);

		const { part } = mount('player-volume-popover');

		getByRole(part, 'button', { name: labels.volume }).click();
		getByRole(part, 'slider', { name: labels.volume }).click();

		expect(controlOf(part).dataset.open).toBe('');

		document.body.click();

		expect(controlOf(part).dataset.open).toBeUndefined();
	});

	test('comes back closed after a reconnect', () => {
		stubHover(false);

		const { part, root } = mount('player-volume-popover');

		getByRole(part, 'button', { name: labels.volume }).click();

		expect(controlOf(part).dataset.open).toBe('');

		root.remove();
		document.body.append(root);

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
