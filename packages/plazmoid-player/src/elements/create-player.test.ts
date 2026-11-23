import type { PlayerUrls } from '@xsynaptic/plazmoid-core';

import { getByRole } from '@testing-library/dom';
import { createMemoryStorage, createPlayerStore } from '@xsynaptic/plazmoid-core';
import { afterEach, describe, expect, test } from 'vitest';

import { createPlayer } from '#elements/create-player.ts';
import { labels } from '#test/labels.ts';
import { createViewStore } from '#view/view-store.ts';

const urls: PlayerUrls = {
	stream: ({ trackId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${trackId}` }),
};

afterEach(() => {
	document.body.replaceChildren();
});

describe('createPlayer', () => {
	test('lands the options and the seek seconds before the bar is shaped', () => {
		const store = createPlayerStore({ storage: createMemoryStorage() });
		const view = createViewStore({ storage: createMemoryStorage() });
		const root = createPlayer({
			isArtworkEnabled: false,
			isOverlayEnabled: false,
			isPanelEnabled: false,
			isScopeEnabled: true,
			labels: { ...labels, seekBack: 'Back {seconds}' },
			seekSeconds: 15,
			store,
			urls,
			view,
		});

		document.body.append(root);

		getByRole(root, 'button', { name: 'Back 15' });
		expect(root.querySelector('pzm-artwork')).toBeNull();
		expect(root.querySelector('pzm-overlay-toggle')).toBeNull();
		expect(root.querySelector('pzm-panel-toggle')).toBeNull();
		expect(root.querySelector('pzm-scope')).not.toBeNull();
		expect(store.getState().urls).toBe(urls);
	});
});
