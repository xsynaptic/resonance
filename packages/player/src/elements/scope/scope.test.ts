import { SonicWaveform } from '@xsynaptic/sonic-ui';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { scopeSurfaceModule } from '#elements/scope/scope-module.ts';
import { landDetail, mount, queueItem } from '#test/mount.ts';

function mountPlaying(width: number) {
	Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
		configurable: true,
		value: width,
	});

	const mounted = mount('player-scope');

	mounted.store.getState().playTrack([queueItem('a')], 'a');

	return mounted;
}

function traced(part: HTMLElement): Promise<SonicWaveform> {
	return vi.waitFor(() => {
		const waveform = part.querySelector('sonic-waveform');

		if (!(waveform instanceof SonicWaveform)) throw new TypeError('The scope has no waveform yet');

		return waveform;
	});
}

afterEach(() => {
	document.body.replaceChildren();
	Reflect.deleteProperty(HTMLDivElement.prototype, 'clientWidth');
});

describe('<player-scope>', () => {
	test('holds no waveform until it plays, then scrolls an inert one only while playing', async () => {
		const { fake, part } = mountPlaying(96);

		await scopeSurfaceModule.load();

		expect(part.querySelector('sonic-waveform')).toBeNull();

		fake.callbacks.current?.onStatus('playing');

		const waveform = await traced(part);

		expect(waveform.inert).toBe(true);
		expect(waveform.playing).toBe(true);

		fake.callbacks.current?.onStatus('paused');

		expect(waveform.playing).toBe(false);
	});

	test('a press stops the trace once it has faded, and a second press starts it again', async () => {
		const { fake, part } = mountPlaying(96);

		fake.callbacks.current?.onStatus('playing');

		const waveform = await traced(part);

		part.querySelector('button')?.click();

		expect(waveform.playing).toBe(true);

		part.querySelector('.player-scope-trace')?.dispatchEvent(new Event('transitionend'));

		expect(waveform.playing).toBe(false);

		part.querySelector('button')?.click();

		expect(waveform.playing).toBe(true);
	});

	test('draws the loaded track from its peaks with its body and its bands', async () => {
		const { fake, part, store } = mountPlaying(96);

		landDetail(store, 'a', {
			peaks: {
				bands: {
					bandCount: 3,
					byteOffset: 36,
					frameCount: 5000,
					framesPerSecond: 25,
					medians: [180, 140, 100],
					minDecibels: -60,
					url: 'https://api.test/scope.bands.bin',
				},
				byteOffset: 24,
				pairCount: 20_000,
				pairsPerSecond: 100,
				rmsRange: [4, 40],
				url: 'https://api.test/scope.peaks.bin',
			},
		});
		fake.callbacks.current?.onStatus('playing');

		const waveform = await traced(part);

		expect(waveform.peaks?.pairsPerSecond).toBe(100);
		expect(waveform.peaks?.rms).toHaveLength(20_000);
		expect(waveform.bands?.medians).toEqual([180, 140, 100]);
	});

	test('loads nothing while it has no width', async () => {
		const { fake, part } = mountPlaying(0);

		fake.callbacks.current?.onStatus('playing');
		await scopeSurfaceModule.load();
		await Promise.resolve();

		expect(part.querySelector('sonic-waveform')).toBeNull();
	});
});
