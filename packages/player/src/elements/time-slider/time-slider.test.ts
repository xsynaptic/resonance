import { SonicWavestrip } from '@xsynaptic/sonic-ui';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { QueueCuePoint } from '#types.ts';

import { landDetail, mount, queueItem } from '#test/mount.ts';

const overview = [0.4, 0.8, 0.6, 0.2];

function cue(startSeconds: number): QueueCuePoint {
	return { artistLine: 'Forest Signal', startSeconds, title: String(startSeconds) };
}

function mountSlider(options: {
	cuePoints?: Array<QueueCuePoint>;
	currentTimeSeconds: number;
	durationSeconds: number;
}) {
	const mounted = mount('player-time-slider');
	const item = queueItem('a', { durationMs: options.durationSeconds * 1000 });

	mounted.store.getState().playTrack([item], 'a');
	landDetail(mounted.store, 'a', {
		waveformOverview: overview,
		...(options.cuePoints === undefined ? {} : { cuePoints: options.cuePoints }),
	});
	mounted.fake.callbacks.current?.onTime(options.currentTimeSeconds);

	return {
		...mounted,
		seeks: () => mounted.fake.engine.seek.mock.calls.map(([seconds]) => seconds),
		strip: requireStrip(mounted.part),
	};
}

const gestureStates = ['cancelling', 'dragging', 'revealed'] as const;

function hold(
	strip: SonicWavestrip,
	held: { pointerType: string; states: Array<(typeof gestureStates)[number]> },
): void {
	vi.spyOn(strip, 'pointerType', 'get').mockReturnValue(held.pointerType);

	for (const state of gestureStates) {
		vi.spyOn(strip, state, 'get').mockReturnValue(held.states.includes(state));
	}
}

function hover(strip: SonicWavestrip, seconds: number | undefined): void {
	vi.spyOn(strip, 'hoverValue', 'get').mockReturnValue(seconds);
	strip.dispatchEvent(new Event('sonic-hover'));
}

function readout(part: HTMLElement): string | undefined {
	const label = part.querySelector<HTMLSpanElement>('.player-cue-label');

	if (!label || label.hidden) return undefined;

	return [...label.children].map((span) => span.textContent).join('|');
}

function pressEnter(target: Element | null): void {
	target?.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
	);
}

function typeEntry(strip: SonicWavestrip, text: string): void {
	const entry = strip.querySelector('input');

	if (!entry) throw new Error('The strip rendered no entry');

	pressEnter(strip.querySelector('.sonic-wavestrip'));
	entry.value = text;
	pressEnter(entry);
}

function requireStrip(part: HTMLElement): SonicWavestrip {
	const strip = part.querySelector('sonic-wavestrip');

	if (!(strip instanceof SonicWavestrip)) throw new Error('The slider rendered no wave strip');

	return strip;
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('<player-time-slider>', () => {
	test('follows the position across the duration the element reports', () => {
		const { strip } = mountSlider({ currentTimeSeconds: 50, durationSeconds: 200 });

		expect(strip.max).toBe(200);
		expect(strip.value).toBe(50);
		expect(strip.disabled).toBe(false);
	});

	test('seeks once to where the strip commits', () => {
		const { seeks, strip } = mountSlider({ currentTimeSeconds: 50, durationSeconds: 200 });

		strip.value = 120;
		strip.dispatchEvent(new Event('input'));
		expect(seeks()).toEqual([]);

		strip.dispatchEvent(new Event('change'));
		expect(seeks()).toEqual([120]);
	});

	test('seeks to a typed clock, and not at all when the entry is emptied', () => {
		const { seeks, strip } = mountSlider({ currentTimeSeconds: 50, durationSeconds: 200 });

		typeEntry(strip, '');
		expect(seeks()).toEqual([]);

		typeEntry(strip, '2:00');
		expect(seeks()).toEqual([120]);
	});

	test('marks each cue point at its start, named by its artist and title', () => {
		const { strip } = mountSlider({
			cuePoints: [cue(30), cue(90)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});

		expect(strip.markers).toEqual([
			{ label: 'Forest Signal - 30', start: 30 },
			{ label: 'Forest Signal - 90', start: 90 },
		]);
	});

	test('speaks the position against the duration', () => {
		const { strip } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 3000 });

		expect(strip.formatSpokenValue?.(65)).toBe('1 minute, 5 seconds of 50 minutes');
	});

	test('reads out the time under the pointer and the Track covering it', () => {
		const { part, strip } = mountSlider({
			cuePoints: [cue(30), cue(90)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});

		hold(strip, { pointerType: 'mouse', states: [] });
		expect(readout(part)).toBeUndefined();

		hover(strip, 45);
		expect(readout(part)).toBe('0:45|Forest Signal|30');

		hover(strip, 12);
		expect(readout(part)).toBe('0:12||');

		hover(strip, undefined);
		expect(readout(part)).toBeUndefined();
	});

	test('reads out the held value rather than the pointer through a mouse drag, and nothing past the cancel zone', () => {
		const { part, strip } = mountSlider({
			cuePoints: [cue(30), cue(90)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});

		hold(strip, { pointerType: 'mouse', states: ['dragging'] });
		strip.value = 100;
		strip.dispatchEvent(new Event('input'));
		expect(readout(part)).toBe('1:40|Forest Signal|90');

		hold(strip, { pointerType: 'mouse', states: ['dragging', 'cancelling'] });
		strip.dispatchEvent(new Event('input'));
		expect(readout(part)).toBeUndefined();
	});

	test('previews the Track under a held finger in whole seconds, and lets go when the hold ends', () => {
		const { part, store, strip } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 200 });

		hold(strip, { pointerType: 'touch', states: ['dragging'] });
		strip.value = 100.6;
		strip.dispatchEvent(new Event('input'));
		expect(store.getState().scrubPreviewSeconds).toBeUndefined();
		expect(readout(part)).toBeUndefined();

		hold(strip, { pointerType: 'touch', states: ['dragging', 'revealed'] });
		strip.dispatchEvent(new Event('sonic-reveal'));
		expect(store.getState().scrubPreviewSeconds).toBe(100);
		expect(part.querySelector('.player-cue-label')?.hasAttribute('data-above')).toBe(true);

		hold(strip, { pointerType: 'touch', states: [] });
		strip.dispatchEvent(new Event('sonic-reveal'));
		expect(store.getState().scrubPreviewSeconds).toBeUndefined();
	});

	test('previews a revealed hold from a finger, and never from a mouse', () => {
		const { store, strip } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 200 });

		strip.value = 100;

		hold(strip, { pointerType: 'mouse', states: ['dragging', 'revealed'] });
		strip.dispatchEvent(new Event('sonic-reveal'));
		expect(store.getState().scrubPreviewSeconds).toBeUndefined();

		hold(strip, { pointerType: 'touch', states: ['dragging', 'revealed'] });
		strip.dispatchEvent(new Event('sonic-reveal'));
		expect(store.getState().scrubPreviewSeconds).toBe(100);
	});

	test('is inert before an item loads, naming a cue point only at its start and with no clock', () => {
		const { part, store } = mount('player-time-slider');

		store.getState().loadQueue([queueItem('a', { durationMs: 200_000 })]);
		landDetail(store, 'a', { cuePoints: [cue(50)], waveformOverview: overview });

		const strip = requireStrip(part);

		expect(strip.disabled).toBe(true);
		expect(strip.getAttribute('aria-hidden')).toBe('true');
		expect(strip.max).toBe(200);

		hold(strip, { pointerType: 'mouse', states: [] });
		hover(strip, 80);
		expect(readout(part)).toBeUndefined();

		hover(strip, 50);
		expect(readout(part)).toBe('|Forest Signal|50');
	});

	test('keeps the same strip for an item measured without peaks', () => {
		const { part, store } = mount('player-time-slider');

		store.getState().playTrack([queueItem('a', { durationMs: 200_000 })], 'a');

		const strip = requireStrip(part);

		expect(strip.peaks).toBeUndefined();
		expect(strip.disabled).toBe(false);
	});
});
