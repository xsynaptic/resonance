import { getByRole } from '@testing-library/dom';
import { SonicWaveform } from '@xsynaptic/sonic-ui';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type * as archiveModule from '#waveform/panel/waveform-archive.ts';

import { panelSurfaceModule } from '#elements/panel/panel-module.ts';
import { LazyModuleError } from '#lib/lazy-module.ts';
import { chunkOf, offline, stubArchiveFetch } from '#test/archive-fetch.ts';
import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';
import { openArchive } from '#waveform/panel/waveform-archive.ts';

vi.mock('#waveform/panel/waveform-archive.ts', () => ({
	openArchive: vi.fn(() => Promise.resolve(undefined)),
}));

function mountPanel() {
	const mounted = mount('player-panel');

	mounted.store.getState().configure({
		urls: {
			archive: ({ itemId }) => Promise.resolve(`https://api.test/${itemId}.dat`),
			stream: ({ itemId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${itemId}` }),
		},
	});
	mounted.store
		.getState()
		.playTrack(
			[queueItem('a', { durationMs: 200_000 }), queueItem('b', { durationMs: 200_000 })],
			'a',
		);

	return mounted;
}

async function openPanel({ part, store }: ReturnType<typeof mountPanel>): Promise<SonicWaveform> {
	store.getState().setPanelOpen(true);

	return vi.waitFor(() => {
		const waveform = part.querySelector('sonic-waveform');

		if (!(waveform instanceof SonicWaveform)) throw new Error('The panel has no waveform yet');

		return waveform;
	});
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.mocked(openArchive).mockClear();
});

describe('<player-panel>', () => {
	test('holds nothing until it opens, and nothing again once closed', async () => {
		const mounted = mountPanel();

		expect(mounted.part.childElementCount).toBe(0);

		await openPanel(mounted);
		mounted.store.getState().setPanelOpen(false);

		expect(mounted.part.childElementCount).toBe(0);
	});

	test('reopens the archive for a new track but not for a zoom', async () => {
		const mounted = mountPanel();

		await openPanel(mounted);
		expect(openArchive).toHaveBeenCalledOnce();

		mounted.store.getState().zoomPanel(1);
		expect(openArchive).toHaveBeenCalledOnce();

		mounted.store.getState().next();
		expect(openArchive).toHaveBeenCalledTimes(2);
	});

	test('settles a request for a failed chunk as its wait ends, so asking again lands the samples', async () => {
		const actual = await vi.importActual<typeof archiveModule>(
			'#waveform/panel/waveform-archive.ts',
		);
		const responses = [offline, () => chunkOf(7)];
		const { chunkRequests } = stubArchiveFetch(() => (responses.shift() ?? offline)());

		vi.mocked(openArchive).mockImplementationOnce(actual.openArchive);

		const waveform = await openPanel(mountPanel());
		const request = await vi.waitFor(() => {
			if (!waveform.requestPeaks) throw new Error('The archive has not opened yet');

			return waveform.requestPeaks;
		});
		const settled = vi.fn();

		vi.useFakeTimers({ toFake: ['clearTimeout', 'setTimeout'] });

		void Promise.resolve(request(0, 10)).then(settled);
		await vi.advanceTimersByTimeAsync(1999);
		expect(settled).not.toHaveBeenCalled();
		expect(waveform.pending).toEqual([[0, 81.92]]);

		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toHaveBeenCalledOnce();
		expect(chunkRequests()).toBe(1);

		await request(0, 10);
		expect(chunkRequests()).toBe(2);
		expect(waveform.peaks?.samples[0]).toBe(7);

		request(0, 10);
		expect(waveform.pending).toEqual([]);
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

	test('seeks once to where the waveform commits, and names the group and its slider', async () => {
		const mounted = mountPanel();
		const waveform = await openPanel(mounted);

		expect(getByRole(mounted.part, 'group', { name: labels.waveformPanel })).toBeDefined();
		expect(waveform.getAttribute('aria-label')).toBe(labels.waveformSeek);

		waveform.value = 40;
		waveform.dispatchEvent(new Event('change'));

		expect(mounted.fake.engine.seek.mock.calls).toEqual([[40]]);
	});

	test('stops zooming at the last level without dropping focus', async () => {
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
