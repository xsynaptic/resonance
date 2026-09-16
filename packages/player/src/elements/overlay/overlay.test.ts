import { fireEvent, getAllByRole, getByRole, queryByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { overlayBodyModule } from '#elements/overlay/overlay-module.ts';
import { LazyModuleError } from '#lib/lazy-module.ts';
import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';

const cuePoints = [
	{ artistLine: 'Nebula Drift', startSeconds: 0, title: 'Opening' },
	{ artistLine: '', startSeconds: 60, title: 'Middle' },
];

function mountOverlay() {
	const mounted = mount('player-overlay');
	const toggle = document.createElement('player-overlay-toggle');
	const dialog = mounted.part.querySelector('dialog');
	if (!dialog) throw new Error('The overlay rendered no dialog');

	mounted.root.prepend(toggle);

	return { ...mounted, dialog, toggle: getByRole(toggle, 'button', { name: labels.expand }) };
}

async function openOverlay({ dialog, toggle }: ReturnType<typeof mountOverlay>) {
	toggle.click();

	return vi.waitFor(() => {
		const close = dialog.querySelector<HTMLButtonElement>('.player-overlay-close');
		if (!close) throw new Error('The overlay body has not arrived');

		return close;
	});
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('<player-overlay>', () => {
	test('opens on expand with close focused, and closes from close and from the dialog dropping open', async () => {
		const mounted = mountOverlay();

		mounted.store.getState().loadQueue([queueItem('a'), queueItem('b')]);

		const close = await openOverlay(mounted);

		expect(mounted.dialog.open).toBe(true);
		expect(document.activeElement).toBe(close);

		close.click();

		expect(mounted.store.getState().isOverlayOpen).toBe(false);
		expect(mounted.dialog.open).toBe(false);
		expect(mounted.dialog.childElementCount).toBe(0);

		mounted.toggle.click();
		mounted.dialog.removeAttribute('open');
		await Promise.resolve();

		expect(mounted.store.getState().isOverlayOpen).toBe(false);
	});

	test('closes once the queue empties', async () => {
		const mounted = mountOverlay();

		mounted.store.getState().loadQueue([queueItem('a')]);
		await openOverlay(mounted);
		getByRole(mounted.dialog, 'button', { name: labels.clearQueue }).click();
		await Promise.resolve();

		expect(mounted.store.getState().isOverlayOpen).toBe(false);
		expect(mounted.dialog.open).toBe(false);
	});

	test('closes and reports the failure when its body fails to arrive', async () => {
		const offline = new LazyModuleError('overlay', 'offline');
		const reportError = vi.fn();

		vi.spyOn(overlayBodyModule, 'load').mockRejectedValueOnce(offline);
		vi.stubGlobal('reportError', reportError);

		const mounted = mountOverlay();

		mounted.store.getState().loadQueue([queueItem('a')]);
		mounted.toggle.click();

		await vi.waitFor(() => {
			expect(mounted.store.getState().isOverlayOpen).toBe(false);
		});
		expect(mounted.dialog.open).toBe(false);
		expect(reportError).toHaveBeenCalledWith(offline);
	});

	test('draws one waveform panel while it is open', async () => {
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
			{} as unknown as CanvasRenderingContext2D,
		);

		const mounted = mountOverlay();

		mounted.root.append(document.createElement('player-panel'));
		mounted.store.getState().playTrack([queueItem('a')], 'a');
		mounted.store.getState().setPanelOpen(true);
		await openOverlay(mounted);

		await vi.waitFor(() => {
			const groups = getAllByRole(mounted.root, 'group', { name: labels.waveformPanel });

			expect(groups).toHaveLength(1);
			expect(groups[0]?.closest('dialog')).toBe(mounted.dialog);
		});
	});

	test('closes for a plain link click and stays open for a modified one', async () => {
		const mounted = mountOverlay();

		mounted.store.getState().loadQueue([queueItem('a', { releaseHref: '/releases/winter' })]);
		await openOverlay(mounted);

		const link = getByRole(mounted.dialog, 'link');

		link.addEventListener('click', (event) => {
			event.preventDefault();
		});
		fireEvent.click(link, { metaKey: true });
		fireEvent.click(link, { button: 1 });

		expect(mounted.store.getState().isOverlayOpen).toBe(true);

		fireEvent.click(link);

		expect(mounted.store.getState().isOverlayOpen).toBe(false);
	});

	test('seeks from a cue in the Tracklist and marks the current one', async () => {
		const mounted = mountOverlay();

		mounted.store.getState().playTrack([queueItem('a', { cuePoints, durationMs: 180_000 })], 'a');
		await openOverlay(mounted);

		expect(
			getByRole(mounted.dialog, 'tab', { name: labels.tracklist }).getAttribute('aria-selected'),
		).toBe('true');

		const middle = getByRole(mounted.dialog, 'button', { name: /Middle/ });

		middle.click();

		expect(mounted.fake.engine.seek).toHaveBeenCalledWith(60);
		expect(middle.getAttribute('aria-current')).toBe('true');
		expect(
			getByRole(mounted.dialog, 'button', { name: /Opening/ }).getAttribute('aria-current'),
		).toBe('false');
	});

	test('offers only the Playlist for an item without cue points', async () => {
		const mounted = mountOverlay();

		mounted.store.getState().playTrack([queueItem('a'), queueItem('b')], 'a');
		await openOverlay(mounted);

		expect(getAllByRole(mounted.dialog, 'tab').map((tab) => tab.textContent)).toStrictEqual([
			labels.playlist,
		]);
		expect(getAllByRole(mounted.dialog, 'listitem')).toHaveLength(2);
	});
});

describe('the overlay tabs', () => {
	test('move with the arrow keys, Home and End', async () => {
		const mounted = mountOverlay();

		mounted.store.getState().playTrack([queueItem('a', { cuePoints })], 'a');
		await openOverlay(mounted);

		const tracklist = getByRole(mounted.dialog, 'tab', { name: labels.tracklist });
		const playlist = getByRole(mounted.dialog, 'tab', { name: labels.playlist });

		tracklist.focus();
		fireEvent.keyDown(tracklist, { key: 'ArrowRight' });

		expect(document.activeElement).toBe(playlist);
		expect(playlist.getAttribute('aria-selected')).toBe('true');
		expect(tracklist.tabIndex).toBe(-1);

		fireEvent.keyDown(playlist, { key: 'ArrowRight' });

		expect(document.activeElement).toBe(tracklist);

		fireEvent.keyDown(tracklist, { key: 'End' });

		expect(document.activeElement).toBe(playlist);

		fireEvent.keyDown(playlist, { key: 'Home' });

		expect(document.activeElement).toBe(tracklist);
	});

	test('keep focus when the Tracklist goes with a focused cue', async () => {
		const mounted = mountOverlay();

		mounted.store.getState().playTrack([queueItem('a', { cuePoints }), queueItem('b')], 'a');
		await openOverlay(mounted);
		getByRole(mounted.dialog, 'button', { name: /Middle/ }).focus();
		mounted.store.getState().next();

		expect(document.activeElement).toBe(
			getByRole(mounted.dialog, 'tab', { name: labels.playlist }),
		);
	});
});

describe('the overlay sheets', () => {
	test('open a list over the phone layout and close back to its button', async () => {
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
			new DOMRect(0, 0, 390, 844),
		);

		const mounted = mountOverlay();

		mounted.store.getState().playTrack([queueItem('a', { cuePoints })], 'a');
		await openOverlay(mounted);

		expect(queryByRole(mounted.dialog, 'tab')).toBeNull();

		const opener = getByRole(mounted.dialog, 'button', { name: labels.tracklist });

		opener.click();

		const sheet = getByRole(mounted.dialog, 'dialog', { hidden: true, name: labels.tracklist });

		expect(sheet).toHaveProperty('open', true);
		expect(getByRole(sheet, 'button', { name: /Middle/ }).textContent).toContain('Middle');

		getByRole(sheet, 'button', { name: labels.close }).click();

		expect(sheet).toHaveProperty('open', false);
		expect(mounted.store.getState().isOverlayOpen).toBe(true);
		expect(document.activeElement).toBe(opener);
	});
});
