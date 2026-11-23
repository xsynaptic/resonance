import type { QueuedTrack } from '@xsynaptic/plazmoid-core';

import { getByRole } from '@testing-library/dom';
import { bindPageControls } from '@xsynaptic/plazmoid-core';
import { afterEach, expect, test, vi } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function countedQueue(queue: ReadonlyArray<QueuedTrack>) {
	const counter = { reads: 0 };
	const tracks = queue.map(
		(track) =>
			new Proxy(track, {
				get: (target, key, receiver) => {
					counter.reads += 1;
					return Reflect.get(target, key, receiver) as unknown;
				},
			}),
	);

	return { counter, tracks };
}

async function readsPerTick(length: number): Promise<number> {
	const { part, store } = mount('pzm-bar', {
		root: { isOverlayEnabled: false, isPanelEnabled: false },
	});
	const tracks = Array.from({ length }, (_, index) =>
		sampleTrack(String(index), { durationMs: 600_000 }),
	);

	document.body.insertAdjacentHTML(
		'beforeend',
		`<div data-pzm-payload='${JSON.stringify(tracks.slice(0, 2))}' hidden></div><div data-pzm-track-id='0'></div>`,
	);
	const controls = bindPageControls(store, document);

	store.getState().loadQueue(tracks);
	store.getState().playAt(0);
	getByRole(part, 'button', { name: labels.queue }).click();
	await vi.waitFor(() => {
		if (!part.querySelector(':scope pzm-tray li')) throw new Error('No tray yet');
	});

	const { counter, tracks: counted } = countedQueue(store.getState().queue);
	store.setState({ queue: counted });
	counter.reads = 0;

	for (let second = 1; second <= 10; second += 1) {
		store.setState({ currentTimeSeconds: second });
	}

	controls.unbind();
	document.body.replaceChildren();

	return counter.reads;
}

test('a tick during playback does no work proportional to the queue', async () => {
	const short = await readsPerTick(4);
	const long = await readsPerTick(40);

	expect(long).toBe(short);
});
