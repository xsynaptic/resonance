import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-play-button>', () => {
	test('follows intent and marks a load toward playback', () => {
		const { fake, part, store } = mount('pzm-play-button');

		store.getState().playTrack([sampleTrack('a')], 'a');

		const host = part.querySelector('sonic-button');

		expect(getByRole(part, 'button', { name: labels.pause }).hasAttribute('disabled')).toBe(false);
		expect(host?.dataset.loading).toBe('');

		store.getState().pause();

		expect(getByRole(part, 'button', { name: labels.play })).toBeDefined();
		expect(host?.dataset.loading).toBeUndefined();

		fake.callbacks.current?.onStatus('loading');

		expect(host?.dataset.loading).toBeUndefined();
	});

	// Safari has no `moveBefore`, so the router's move arrives as a disconnect and a connect
	test('binds once after a disconnect and a connect', async () => {
		const { fake, part, root, store } = mount('pzm-play-button');

		store.getState().playTrack([sampleTrack('a')], 'a');
		fake.callbacks.current?.onStatus('playing');
		root.remove();
		document.body.append(root);
		await Promise.resolve();
		getByRole(part, 'button', { name: labels.pause }).click();

		expect(store.getState().isPaused).toBe(true);
		expect(part.querySelectorAll('button')).toHaveLength(1);
	});
});
