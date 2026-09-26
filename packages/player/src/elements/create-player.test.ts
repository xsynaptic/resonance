import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import type { PlayerUrls } from '#types.ts';

import { createPlayer } from '#elements/create-player.ts';
import { createPlayerStore } from '#store/player-store.ts';
import { labels } from '#test/labels.ts';

const urls: PlayerUrls = {
	stream: ({ itemId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${itemId}` }),
};

afterEach(() => {
	document.body.replaceChildren();
});

describe('createPlayer', () => {
	test('lands the options and the seek seconds before the bar is shaped', () => {
		const store = createPlayerStore({ isPersistent: false });
		const root = createPlayer({
			isArtworkEnabled: false,
			labels: { ...labels, seekBack: 'Back {seconds}' },
			seekSeconds: 15,
			store,
			urls,
		});

		document.body.append(root);

		getByRole(root, 'button', { name: 'Back 15' });
		expect(root.querySelector('player-artwork')).toBeNull();
		expect(store.getState().urls).toBe(urls);
	});
});
