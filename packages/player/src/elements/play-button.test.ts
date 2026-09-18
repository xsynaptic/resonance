import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-play-button>', () => {
	test('follows intent and marks a load toward playback', () => {
		const { fake, part, store } = mount('player-play-button');

		store.getState().playTrack([queueItem('a')], 'a');

		const pause = getByRole(part, 'button', { name: labels.pause });

		expect(pause.hasAttribute('disabled')).toBe(false);
		expect(pause.dataset.loading).toBe('');
		expect(pause.dataset.paused).toBeUndefined();

		store.getState().pause();

		const play = getByRole(part, 'button', { name: labels.play });

		expect(play.dataset.loading).toBeUndefined();
		expect(play.dataset.paused).toBe('');

		fake.callbacks.current?.onStatus('loading');

		expect(play.dataset.loading).toBeUndefined();
	});

	// Safari has no `moveBefore`, so the router's move arrives as a disconnect and a connect
	test('binds once after a disconnect and a connect', () => {
		const { fake, part, root, store } = mount('player-play-button');

		store.getState().playTrack([queueItem('a')], 'a');
		fake.callbacks.current?.onStatus('playing');
		root.remove();
		document.body.append(root);
		getByRole(part, 'button', { name: labels.pause }).click();

		expect(store.getState().isPaused).toBe(true);
		expect(part.querySelectorAll('button')).toHaveLength(1);
	});
});
