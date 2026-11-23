import { SonicSlider } from '@xsynaptic/sonic-ui';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

function mountStrip() {
	const mounted = mount('pzm-progress');
	const slider = mounted.part.querySelector('sonic-slider');

	if (!(slider instanceof SonicSlider)) throw new TypeError('The strip rendered no slider');

	return {
		...mounted,
		seeks: () => mounted.fake.engine.seek.mock.calls.map(([seconds]) => seconds),
		slider,
	};
}

describe('<pzm-progress>', () => {
	test('is disabled and hidden from assistive technology until a duration is known', () => {
		const { fake, slider, store } = mountStrip();
		const inertness = () => [slider.disabled, slider.getAttribute('aria-hidden')];

		expect(inertness()).toEqual([true, 'true']);

		store.getState().playTrack([sampleTrack('a')], 'a');
		fake.callbacks.current?.onTime(45);

		expect(inertness()).toEqual([true, 'true']);

		fake.callbacks.current?.onDuration(180);

		expect(inertness()).toEqual([false, 'false']);
		expect([slider.value, slider.max]).toEqual([45, 180]);
		expect(slider.getAttribute('aria-label')).toBe(labels.seek);

		store.getState().clearQueue();

		expect(inertness()).toEqual([true, 'true']);
	});

	test('seeks once to where the slider commits', () => {
		const { fake, seeks, slider, store } = mountStrip();

		store.getState().playTrack([sampleTrack('a')], 'a');
		fake.callbacks.current?.onDuration(180);

		slider.value = 135;
		slider.dispatchEvent(new Event('input'));

		expect(seeks()).toStrictEqual([]);

		slider.dispatchEvent(new Event('change'));

		expect(seeks()).toStrictEqual([135]);
	});

	test('speaks the position against the duration', () => {
		const { fake, slider, store } = mountStrip();

		store.getState().playTrack([sampleTrack('a')], 'a');
		fake.callbacks.current?.onDuration(180);

		expect(slider.formatSpokenValue?.(45)).toBe('45 seconds of 3 minutes');
	});

	test('shows what the media element has buffered, and again as more arrives', () => {
		const { fake, slider, store } = mountStrip();
		const { element } = fake.engine;
		let bufferedSeconds = 30;

		vi.spyOn(element, 'buffered', 'get').mockImplementation(() => ({
			end: () => bufferedSeconds,
			length: 1,
			start: () => 0,
		}));

		store.getState().playTrack([sampleTrack('a')], 'a');
		fake.callbacks.current?.onDuration(180);

		expect(slider.buffered).toEqual([[0, 30]]);

		bufferedSeconds = 90;
		element.dispatchEvent(new Event('progress'));

		expect(slider.buffered).toEqual([[0, 90]]);
	});

	test('drops the buffered range when the media element empties for the next track', () => {
		const { fake, slider, store } = mountStrip();
		const { element } = fake.engine;
		let rangeCount = 1;

		vi.spyOn(element, 'buffered', 'get').mockImplementation(() => ({
			end: () => 30,
			length: rangeCount,
			start: () => 0,
		}));

		store.getState().playTrack([sampleTrack('a')], 'a');
		fake.callbacks.current?.onDuration(180);

		rangeCount = 0;
		element.dispatchEvent(new Event('emptied'));

		expect(slider.buffered).toEqual([]);
	});
});
