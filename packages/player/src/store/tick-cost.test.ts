import { getByRole } from '@testing-library/dom';
import { afterEach, expect, test, vi } from 'vitest';

import type { QueuedItem } from '#types.ts';

import { bindPageControls } from '#page-controls.ts';
import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function countedQueue(queue: ReadonlyArray<QueuedItem>) {
	const counter = { reads: 0 };
	const items = queue.map(
		(item) =>
			new Proxy(item, {
				get: (target, key, receiver) => {
					counter.reads += 1;
					return Reflect.get(target, key, receiver) as unknown;
				},
			}),
	);

	return { counter, items };
}

async function readsPerTick(length: number): Promise<number> {
	const { part, store } = mount(
		'player-bar',
		{},
		{
			isOverlayEnabled: false,
			isPanelEnabled: false,
		},
	);
	const items = Array.from({ length }, (_, index) =>
		queueItem(String(index), { durationMs: 600_000 }),
	);

	document.body.insertAdjacentHTML(
		'beforeend',
		`<div data-player-payload='${JSON.stringify(items.slice(0, 2))}' hidden></div><div data-track-id='0'></div>`,
	);
	const controls = bindPageControls(store, document);

	store.getState().loadQueue(items);
	store.getState().playAt(0);
	getByRole(part, 'button', { name: labels.queue }).click();
	await vi.waitFor(() => {
		if (!part.querySelector(':scope player-tray li')) throw new Error('No tray yet');
	});

	const { counter, items: counted } = countedQueue(store.getState().queue);
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
	const long = await readsPerTick(400);

	expect(long).toBe(short);
});
