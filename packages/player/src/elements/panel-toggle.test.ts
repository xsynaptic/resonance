import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#components/test-labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-panel-toggle>', () => {
	test('opens the panel once a track is loaded, and reports it pressed', () => {
		const { part, store } = mount('player-panel-toggle');
		const toggle = getByRole(part, 'button', { name: labels.waveformPanel });

		expect(toggle.hasAttribute('disabled')).toBe(true);
		expect(toggle.getAttribute('aria-pressed')).toBe('false');

		store.getState().playTrack([queueItem('a')], 'a');
		toggle.click();

		expect(store.getState().isPanelOpen).toBe(true);
		expect(toggle.getAttribute('aria-pressed')).toBe('true');
	});
});
