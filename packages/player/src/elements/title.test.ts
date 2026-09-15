import { getByRole, getByText, queryByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-title>', () => {
	test('shows the placeholder until something is queued', () => {
		const { part } = mount('player-title');

		expect(getByText(part, labels.nowPlaying).className).toBe('player-track-empty');
	});

	test('links the title to its release, and renders it as text without one', () => {
		const { part, store } = mount('player-title');

		store.getState().playTrack([queueItem('a', { releaseHref: '/releases/a' })], 'a');

		expect(getByRole(part, 'link', { name: 'Mix a' }).getAttribute('href')).toBe('/releases/a');

		store.getState().playTrack([queueItem('b')], 'b');

		expect(queryByRole(part, 'link')).toBeNull();
		expect(getByText(part, 'Mix b').closest('.player-track-title')?.localName).toBe('span');
		expect(part.querySelectorAll('.player-marquee')).toHaveLength(1);
	});

	test('marks a queued item as idle until it loads', () => {
		const { part, store } = mount('player-title');

		store.getState().loadQueue([queueItem('a')]);

		expect(part.dataset.idle).toBe('');

		store.getState().playAt(0);

		expect(part.dataset.idle).toBeUndefined();
	});
});
