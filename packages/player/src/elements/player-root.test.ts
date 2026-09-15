import { afterEach, describe, expect, test, vi } from 'vitest';

import { labels } from '#components/test-labels.ts';
import { PlayerRoot } from '#elements/player-root.ts';
import { createPlayerStore } from '#store/player-store.ts';
import { mount, queueItem } from '#test/mount.ts';

// A tag of its own, so the upgrade happens here whatever else in the file has already defined `player-root`
class EarlyRoot extends PlayerRoot {}

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-root>', () => {
	test('mirrors the state a host styles against', () => {
		const { root, store } = mount('player-time');

		expect(root.dataset.status).toBe('idle');
		expect(root.dataset.empty).toBe('');
		expect(root.dataset.paused).toBe('');

		store.getState().playTrack([queueItem('a')], 'a');

		expect(root.dataset.status).toBe('loading');
		expect(root.dataset.empty).toBeUndefined();
		expect(root.dataset.paused).toBeUndefined();
		expect(root.dataset.waiting).toBe('');
		expect(root.dataset.muted).toBeUndefined();

		store.getState().toggleMuted();

		expect(root.dataset.muted).toBe('');
	});

	test('hydrates its store once however often it reconnects', () => {
		const { root, store } = mount('player-time');
		const hydratePreferences = vi.spyOn(store.getState(), 'hydratePreferences');

		root.remove();
		document.body.append(root);

		expect(hydratePreferences).not.toHaveBeenCalled();
	});

	test('takes a store handed to it before its tag was defined', () => {
		const store = createPlayerStore({ isPersistent: false });
		const early = Object.assign(document.createElement('player-early-root'), { labels, store });

		document.body.append(early);

		if (!customElements.get('player-early-root')) {
			customElements.define('player-early-root', EarlyRoot);
		}

		expect(early.dataset.status).toBe('idle');
	});
});
