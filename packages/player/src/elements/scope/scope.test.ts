import { SonicWaveform } from '@xsynaptic/sonic-ui';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { scopeSurfaceModule } from '#elements/scope/scope-module.ts';
import { mount, queueItem } from '#test/mount.ts';

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

		if (!(waveform instanceof SonicWaveform)) throw new Error('The scope has no waveform yet');

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

	test('loads nothing while it has no width', async () => {
		const { fake, part } = mountPlaying(0);

		fake.callbacks.current?.onStatus('playing');
		await scopeSurfaceModule.load();
		await Promise.resolve();

		expect(part.querySelector('sonic-waveform')).toBeNull();
	});
});
