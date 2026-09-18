import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-queue-button>', () => {
	test('toggles the tray and reports it expanded', () => {
		const { part, store } = mount('player-queue-button');
		const button = getByRole(part, 'button', { name: labels.addToQueue });

		expect(button.getAttribute('aria-expanded')).toBe('false');

		button.click();

		expect(store.getState().isTrayOpen).toBe(true);
		expect(button.getAttribute('aria-expanded')).toBe('true');
	});
});
