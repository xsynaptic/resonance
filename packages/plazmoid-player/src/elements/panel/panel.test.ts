import { getByRole } from '@testing-library/dom';
import { SonicWaveform } from '@xsynaptic/sonic-ui';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { panelSurfaceModule } from '#elements/panel/panel-module.ts';
import { defaultLabels } from '#labels.ts';
import { LazyModuleError } from '#lib/lazy-module.ts';
import { landDetail, mount, sampleTrack } from '#test/mount.ts';
import { chunkOf, offline, stubPeaksFetch } from '#test/peaks-fetch.ts';

function mountPanel() {
	const mounted = mount('pzm-panel');

	mounted.store
		.getState()
		.playTrack(
			[sampleTrack('a', { durationMs: 200_000 }), sampleTrack('b', { durationMs: 200_000 })],
			'a',
		);

	for (const trackId of ['a', 'b']) {
		landDetail(mounted.store, trackId, {
			peaks: {
				byteOffset: 24,
				formatVersion: 1,
				pairCount: 20_000,
				pairsPerSecond: 100,
				rmsRange: [4, 40],
				url: `https://api.test/${trackId}.peaks.bin`,
			},
		});
	}

	return mounted;
}

async function openPanel({ part, view }: ReturnType<typeof mountPanel>): Promise<SonicWaveform> {
	view.getState().setPanelOpen(true);

	return vi.waitFor(() => {
		const waveform = part.querySelector('sonic-waveform');

		if (!(waveform instanceof SonicWaveform)) throw new TypeError('The panel has no waveform yet');

		return waveform;
	});
}

// happy-dom inherits no custom property, so the rule has to match the waveform itself
function setTintTokens(declarations: string): void {
	const sheet = document.createElement('style');

	sheet.textContent = `sonic-waveform { ${declarations} }`;
	document.head.append(sheet);
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
	document.head.replaceChildren();
	vi.restoreAllMocks();
});

describe('<pzm-panel>', () => {
	test('holds nothing until it opens, and nothing again once closed', async () => {
		const mounted = mountPanel();

		expect(mounted.part.childElementCount).toBe(0);

		await openPanel(mounted);
		mounted.view.getState().setPanelOpen(false);

		expect(mounted.part.childElementCount).toBe(0);
	});

	test('draws the next track from its own peaks, and keeps the one it has through a zoom', async () => {
		const { urls } = stubPeaksFetch(offline);
		const mounted = mountPanel();
		const waveform = await openPanel(mounted);
		const { peaks } = waveform;

		mounted.view.getState().zoomPanel(1);
		expect(waveform.peaks).toBe(peaks);

		mounted.store.getState().next();
		expect(waveform.peaks).not.toBe(peaks);

		void waveform.requestPeaks?.(0, 1);
		expect(urls()).toStrictEqual(['https://api.test/b.peaks.bin']);
	});

	test('opens no reader for a descriptor of a format version it does not know', async () => {
		const { urls } = stubPeaksFetch(offline);
		const mounted = mount('pzm-panel');

		mounted.store.getState().playTrack([sampleTrack('a', { durationMs: 200_000 })], 'a');
		landDetail(mounted.store, 'a', {
			peaks: {
				byteOffset: 24,
				formatVersion: 2,
				pairCount: 20_000,
				pairsPerSecond: 100,
				rmsRange: [4, 40],
				url: 'https://api.test/a.peaks.bin',
			},
		});

		const waveform = await openPanel(mounted);

		expect(waveform.peaks).toBeUndefined();
		expect(waveform.requestPeaks).toBeUndefined();
		expect(urls()).toStrictEqual([]);
	});

	test('settles a request for a failed chunk as its wait ends, so asking again lands the samples', async () => {
		const responses = [offline, () => chunkOf(7)];
		const { chunkRequests } = stubPeaksFetch(() => (responses.shift() ?? offline)());

		const waveform = await openPanel(mountPanel());
		const request = await vi.waitFor(() => {
			if (!waveform.requestPeaks) throw new Error('The peaks have not opened yet');

			return waveform.requestPeaks;
		});
		const settled = vi.fn();

		vi.useFakeTimers({ toFake: ['clearTimeout', 'setTimeout'] });

		void Promise.resolve(request(0, 10)).then(settled);
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).not.toHaveBeenCalled();
		expect(waveform.pending).toEqual([[0, 81.92]]);

		await vi.runOnlyPendingTimersAsync();
		expect(settled).toHaveBeenCalledOnce();
		expect(chunkRequests()).toBe(1);

		await request(0, 10);
		expect(chunkRequests()).toBe(2);
		expect(waveform.peaks?.samples[0]).toBe(7);

		void request(0, 10);
		expect(waveform.pending).toEqual([]);
	});

	test('closes and reports the failure when its surface fails to arrive', async () => {
		const offline = new LazyModuleError('panel', 'offline');
		const reportError = vi.fn();

		vi.spyOn(panelSurfaceModule, 'load').mockRejectedValueOnce(offline);
		vi.stubGlobal('reportError', reportError);

		const mounted = mountPanel();

		mounted.view.getState().setPanelOpen(true);

		await vi.waitFor(() => {
			expect(mounted.view.getState().isPanelOpen).toBe(false);
		});
		expect(mounted.part.childElementCount).toBe(0);
		expect(reportError).toHaveBeenCalledWith(offline);
	});

	test('tints the loaded track with its bands and draws its body', async () => {
		stubPeaksFetch(offline);

		const mounted = mount('pzm-panel');

		mounted.store.getState().playTrack([sampleTrack('a', { durationMs: 200_000 })], 'a');
		landDetail(mounted.store, 'a', {
			peaks: {
				bands: {
					bandCount: 3,
					byteOffset: 36,
					frameCount: 5000,
					framesPerSecond: 25,
					medians: [180, 140, 100],
					minDecibels: -60,
					url: 'https://api.test/tinted.bands.bin',
				},
				byteOffset: 24,
				formatVersion: 1,
				pairCount: 20_000,
				pairsPerSecond: 100,
				rmsRange: [4, 40],
				url: 'https://api.test/tinted.peaks.bin',
			},
		});

		const waveform = await openPanel(mounted);

		expect(waveform.bands).toMatchObject({ bandCount: 3, framesPerSecond: 25 });
		expect(waveform.bands?.medians).toEqual([180, 140, 100]);
		expect(waveform.peaks?.rms).toHaveLength(20_000);
		expect(waveform.peaks?.rmsRange).toEqual([4, 40]);
	});

	test('takes its tint cell from the tokens, leaving out a reading set to none', async () => {
		setTintTokens('--pzm-tint-hue: none; --pzm-tint-dynamics: energy');

		const waveform = await openPanel(mountPanel());

		expect(waveform.hasAttribute('tint-hue')).toBe(false);
		expect(waveform.getAttribute('tint-dynamics')).toBe('energy');
	});

	test('seeks once to where the waveform commits, and names the group and its slider', async () => {
		const mounted = mountPanel();
		const waveform = await openPanel(mounted);

		expect(getByRole(mounted.part, 'group', { name: defaultLabels.waveformPanel })).toBeDefined();
		expect(waveform.getAttribute('aria-label')).toBe(defaultLabels.waveformSeek);

		waveform.value = 40;
		waveform.dispatchEvent(new Event('change'));

		expect(mounted.fake.engine.seek.mock.calls).toEqual([[40]]);
	});

	test('stops zooming at the last level without dropping focus', async () => {
		const mounted = mountPanel();

		mounted.view.getState().setPanelZoom(240);
		await openPanel(mounted);

		const zoomIn = getByRole(mounted.part, 'button', { name: defaultLabels.zoomIn });
		const zoomOut = getByRole(mounted.part, 'button', { name: defaultLabels.zoomOut });

		expect(zoomIn.getAttribute('aria-disabled')).toBe('true');

		zoomIn.click();
		expect(mounted.view.getState().panelPxPerSecond).toBe(240);

		zoomOut.click();
		expect(mounted.view.getState().panelPxPerSecond).toBe(160);
		expect(zoomIn.hasAttribute('aria-disabled')).toBe(false);
	});

	test('takes a gesture between two levels and leaves both buttons live', async () => {
		const mounted = mountPanel();
		const waveform = await openPanel(mounted);

		expect([waveform.zoomable, waveform.zoomMin, waveform.zoomMax]).toEqual([true, 20, 240]);

		waveform.zoom = 239;
		waveform.dispatchEvent(new Event('sonic-zoom'));

		const zoomIn = getByRole(mounted.part, 'button', { name: defaultLabels.zoomIn });

		expect(mounted.view.getState().panelPxPerSecond).toBe(239);
		expect(zoomIn.hasAttribute('aria-disabled')).toBe(false);

		zoomIn.click();
		expect(mounted.view.getState().panelPxPerSecond).toBe(240);
		expect(waveform.zoom).toBe(240);
		expect(zoomIn.getAttribute('aria-disabled')).toBe('true');
	});
});
