import {
	fireEvent,
	getAllByRole,
	getByRole,
	getByText,
	queryAllByRole,
} from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { QueueItem } from '#types.ts';

import { trayModule } from '#elements/tray/tray-module.ts';
import { LazyModuleError } from '#lib/lazy-module.ts';
import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';

const threeItems = [queueItem('a'), queueItem('b'), queueItem('c')];

// happy-dom lays nothing out, so each row reports a 40px slot down the list
async function mountDraggableTray() {
	const mounted = await mountTray();
	const list = getByRole(mounted.part, 'list');
	const rowHeight = 40;

	vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 400));

	for (const [index, row] of getAllByRole(list, 'listitem').entries()) {
		vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
			new DOMRect(0, index * rowHeight, 320, rowHeight),
		);
	}

	const [handle] = getAllByRole(list, 'button', { name: labels.reorder });
	if (!handle) throw new Error('The tray drew no reorder handle');

	return { handle, list, mounted };
}

// The tray alone, outside the popover whose dismiss happy-dom misreads once a press removes its own row
async function mountTray(items: Array<QueueItem> = threeItems) {
	await trayModule.load();

	const mounted = mount('player-tray');

	mounted.store.getState().loadQueue(items);

	return mounted;
}

async function openQueue() {
	const mounted = mount('player-queue-button');
	const trigger = getByRole(mounted.part, 'button', { name: labels.addToQueue });

	mounted.store.getState().loadQueue(threeItems);
	trigger.click();

	return { ...mounted, tray: await waitForTray(mounted.part), trigger };
}

function queuedIds({ store }: ReturnType<typeof mount>): Array<string> {
	return store.getState().queue.map((item) => item.itemId);
}

async function waitForTray(part: HTMLElement): Promise<HTMLElement> {
	return vi.waitFor(() => {
		const tray = part.querySelector('player-tray');
		if (!tray?.firstElementChild) throw new Error('The tray has not arrived');

		return tray;
	});
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('<player-queue-button> with its tray', () => {
	test('opens on a press and plays the row picked', async () => {
		const { store, tray, trigger } = await openQueue();

		expect(trigger.getAttribute('aria-expanded')).toBe('true');

		getByRole(tray, 'button', { name: /Mix b/ }).click();

		expect(store.getState().currentIndex).toBe(1);
		expect(store.getState().isTrayOpen).toBe(true);
	});

	test('closes on a click outside it and on Escape, handing focus back to the trigger', async () => {
		const { part, store, trigger } = await openQueue();

		document.body.click();

		expect(store.getState().isTrayOpen).toBe(false);
		expect(part.querySelector('player-tray')).toBeNull();

		trigger.click();
		fireEvent.keyDown(getByRole(await waitForTray(part), 'button', { name: /Mix b/ }), {
			key: 'Escape',
		});

		expect(store.getState().isTrayOpen).toBe(false);
		expect(document.activeElement).toBe(trigger);
	});

	test('stays closed and reports the failure when the tray fails to arrive', async () => {
		const offline = new LazyModuleError('tray', 'offline');
		const reportError = vi.fn();

		vi.spyOn(trayModule, 'load').mockRejectedValueOnce(offline);
		vi.stubGlobal('reportError', reportError);

		const { part, store } = mount('player-queue-button');
		const trigger = getByRole(part, 'button', { name: labels.addToQueue });

		store.getState().loadQueue([queueItem('a')]);
		trigger.click();

		await vi.waitFor(() => {
			expect(store.getState().isTrayOpen).toBe(false);
		});
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(reportError).toHaveBeenCalledWith(offline);
	});
});

describe('<player-tray>', () => {
	test('removes a row, and shows the empty message once the queue is cleared', async () => {
		const { part } = await mountTray();

		getAllByRole(part, 'button', { name: labels.removeFromQueue })[1]?.click();

		expect(getAllByRole(part, 'listitem').map((row) => row.textContent)).toStrictEqual([
			expect.stringContaining('Mix a'),
			expect.stringContaining('Mix c'),
		]);

		getByRole(part, 'button', { name: labels.clearQueue }).click();

		expect(queryAllByRole(part, 'listitem')).toHaveLength(0);
		expect(getByText(part, labels.empty).hidden).toBe(false);
	});

	test('shuffles an ordinary queue', async () => {
		const { part, store } = await mountTray();
		const shuffle = getByRole(part, 'button', { name: labels.shuffle });

		expect(shuffle.getAttribute('aria-pressed')).toBe('false');

		shuffle.click();

		expect(store.getState().isShuffling).toBe(true);
		expect(shuffle.getAttribute('aria-pressed')).toBe('true');
	});

	test('moves a row on Alt+Arrow, announces the move and keeps focus on its handle', async () => {
		const mounted = await mountTray();
		const handle = getAllByRole(mounted.part, 'button', { name: labels.reorder })[1];

		handle?.focus();
		fireEvent.keyDown(handle ?? document.body, { altKey: true, key: 'ArrowUp' });

		expect(queuedIds(mounted)).toStrictEqual(['b', 'a', 'c']);
		expect(getByRole(mounted.part, 'status').textContent).toBe('Moved to position 1 of 3');
		expect(document.activeElement).toBe(handle);
	});

	test('moves a dragged row to where the pointer lets go', async () => {
		const { handle, mounted } = await mountDraggableTray();

		fireEvent.pointerDown(handle, { clientY: 60, pointerId: 1 });
		fireEvent.pointerMove(handle, { clientY: 110, pointerId: 1 });
		fireEvent.pointerUp(handle, { pointerId: 1 });

		expect(queuedIds(mounted)).toStrictEqual(['b', 'c', 'a']);
	});

	test('leaves a drag running when another pointer lifts elsewhere in the list', async () => {
		const { handle, list, mounted } = await mountDraggableTray();

		fireEvent.pointerDown(handle, { clientY: 60, pointerId: 1 });
		fireEvent.pointerMove(handle, { clientY: 110, pointerId: 1 });
		fireEvent.pointerUp(list, { pointerId: 2 });
		fireEvent.pointerCancel(list, { pointerId: 2 });

		expect(queuedIds(mounted)).toStrictEqual(['a', 'b', 'c']);

		fireEvent.pointerUp(handle, { pointerId: 1 });

		expect(queuedIds(mounted)).toStrictEqual(['b', 'c', 'a']);
	});
});
