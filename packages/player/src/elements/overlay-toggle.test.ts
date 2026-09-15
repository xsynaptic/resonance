import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#components/test-labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-overlay-toggle>', () => {
	test('expands into a dialog once something is queued', () => {
		const { part, store } = mount('player-overlay-toggle');
		const toggle = getByRole(part, 'button', { name: labels.expand });

		expect(toggle.getAttribute('aria-haspopup')).toBe('dialog');
		expect(toggle.hasAttribute('disabled')).toBe(true);

		store.getState().loadQueue([queueItem('a')]);
		toggle.click();

		expect(store.getState().isOverlayOpen).toBe(true);
	});
});
