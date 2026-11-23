import { createMemoryStorage, createPlayerStore } from '@xsynaptic/plazmoid-core';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { PlayerRoot } from '#elements/player-root.ts';
import { defaultLabels } from '#labels.ts';
import { mount, sampleTrack } from '#test/mount.ts';

// A tag of its own, so the upgrade happens here whatever else in the file has already defined `pzm-root`
class EarlyRoot extends PlayerRoot {}

function defineEarlyRoot() {
	if (!customElements.get('pzm-early-root')) {
		customElements.define('pzm-early-root', EarlyRoot);
	}
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-root>', () => {
	test('mirrors the state a host styles against', () => {
		const { root, store } = mount('pzm-time');

		expect(root.dataset.status).toBe('idle');
		expect(root.dataset.empty).toBe('');
		expect(root.dataset.paused).toBe('');

		store.getState().playTrack([sampleTrack('a')], 'a');

		expect(root.dataset.status).toBe('loading');
		expect(root.dataset.empty).toBeUndefined();
		expect(root.dataset.paused).toBeUndefined();
		expect(root.dataset.waiting).toBe('');
		expect(root.dataset.muted).toBeUndefined();

		store.getState().toggleMuted();

		expect(root.dataset.muted).toBe('');
	});

	test('marks itself pending while the displayed track waits on its detail', async () => {
		const { root, store } = mount('pzm-time');
		const answer = Promise.withResolvers<undefined>();

		store.getState().configure({
			urls: {
				detail: () => answer.promise,
				stream: () => Promise.resolve({ status: 'capped' }),
			},
		});
		store.getState().loadQueue([sampleTrack('a')]);

		await vi.waitFor(() => {
			expect(root.dataset.pending).toBe('');
		});

		answer.resolve(undefined);

		await vi.waitFor(() => {
			expect(root.dataset.pending).toBeUndefined();
		});
	});

	test('takes a store handed to it before its tag was defined', () => {
		const store = createPlayerStore({ storage: createMemoryStorage() });
		const early = Object.assign(document.createElement('pzm-early-root'), {
			labels: defaultLabels,
			store,
		});

		document.body.append(early);

		defineEarlyRoot();

		expect(early.dataset.status).toBe('idle');
	});
});
