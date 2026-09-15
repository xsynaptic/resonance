import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-seek-button>', () => {
	test('seeks by its own interval in either direction once a track is loaded', () => {
		const { fake, root, store } = mount('player-seek-button', { seconds: '30' });
		const back = document.createElement('player-seek-button');

		back.setAttribute('seconds', '-30');
		root.append(back);

		const forward = getByRole(root, 'button', { name: labels.seekForward });

		expect(forward.hasAttribute('disabled')).toBe(true);

		store.getState().playTrack([queueItem('a', { durationMs: 180_000 })], 'a');
		fake.callbacks.current?.onTime(100);
		forward.click();

		expect(fake.engine.seek).toHaveBeenCalledWith(130);

		getByRole(root, 'button', { name: labels.seekBack }).click();

		expect(fake.engine.seek).toHaveBeenCalledWith(100);
	});

	test('writes the interval into the glyph without its sign', () => {
		const { part } = mount('player-seek-button', { seconds: '-15' });

		expect(part.querySelector('text')?.textContent).toBe('15');
	});
});
