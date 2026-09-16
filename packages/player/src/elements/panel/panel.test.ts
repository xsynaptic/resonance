import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { panelSurfaceModule } from '#elements/panel/panel-module.ts';
import { LazyModuleError } from '#lib/lazy-module.ts';
import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';
import { openArchive } from '#waveform/panel/waveform-archive.ts';

vi.mock('#waveform/panel/waveform-archive.ts', () => ({
	openArchive: vi.fn(() => Promise.resolve(undefined)),
}));

function mountPanel() {
	const mounted = mount('player-panel');

	mounted.root.urls = {
		archive: ({ itemId }) => Promise.resolve(`https://api.test/${itemId}.dat`),
		stream: ({ itemId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${itemId}` }),
	};
	mounted.store.getState().playTrack([queueItem('a'), queueItem('b')], 'a');

	return mounted;
}

async function openPanel({ part, store }: ReturnType<typeof mountPanel>): Promise<void> {
	store.getState().setPanelOpen(true);

	await vi.waitFor(() => {
		expect(part.querySelector('canvas')).not.toBeNull();
	});
}

// happy-dom has no 2d context; nothing paints, since its ResizeObserver never starts the frame loop
function stubContext(): void {
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
		{} as unknown as CanvasRenderingContext2D,
	);
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.mocked(openArchive).mockClear();
});

describe('<player-panel>', () => {
	test('holds nothing until it opens, and nothing again once closed', async () => {
		stubContext();

		const mounted = mountPanel();

		expect(mounted.part.childElementCount).toBe(0);

		await openPanel(mounted);
		mounted.store.getState().setPanelOpen(false);

		expect(mounted.part.childElementCount).toBe(0);
	});

	test('reopens the archive for a new track but not for a zoom', async () => {
		stubContext();

		const mounted = mountPanel();

		await openPanel(mounted);
		expect(openArchive).toHaveBeenCalledOnce();

		mounted.store.getState().zoomPanel(1);
		expect(openArchive).toHaveBeenCalledOnce();

		mounted.store.getState().next();
		expect(openArchive).toHaveBeenCalledTimes(2);
	});

	test('closes and reports the failure when its surface fails to arrive', async () => {
		const offline = new LazyModuleError('panel', 'offline');
		const reportError = vi.fn();

		vi.spyOn(panelSurfaceModule, 'load').mockRejectedValueOnce(offline);
		vi.stubGlobal('reportError', reportError);

		const mounted = mountPanel();

		mounted.store.getState().setPanelOpen(true);

		await vi.waitFor(() => {
			expect(mounted.store.getState().isPanelOpen).toBe(false);
		});
		expect(mounted.part.childElementCount).toBe(0);
		expect(reportError).toHaveBeenCalledWith(offline);
	});

	test('stops zooming at the last level without dropping focus', async () => {
		stubContext();

		const mounted = mountPanel();

		mounted.store.setState({ panelPxPerSecond: 240 });
		await openPanel(mounted);

		const zoomIn = getByRole(mounted.part, 'button', { name: labels.zoomIn });
		const zoomOut = getByRole(mounted.part, 'button', { name: labels.zoomOut });

		expect(zoomIn.getAttribute('aria-disabled')).toBe('true');

		zoomIn.click();
		expect(mounted.store.getState().panelPxPerSecond).toBe(240);

		zoomOut.click();
		expect(mounted.store.getState().panelPxPerSecond).toBe(160);
		expect(zoomIn.getAttribute('aria-disabled')).toBe('false');
	});
});
