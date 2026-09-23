import { fireEvent, getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { QueueCuePoint } from '#types.ts';

import { holdDelayMs } from '#elements/time-slider/overview-scrub.ts';
import { labels } from '#test/labels.ts';
import { mount, queueItem } from '#test/mount.ts';

// Vitest wants a constructible stub, and the renderer never reads back from the path it builds
class StubPath2D {
	arc = vi.fn();
	closePath = vi.fn();
	lineTo = vi.fn();
	moveTo = vi.fn();
	rect = vi.fn();
	roundRect = vi.fn();
}

const themes = {
	dim: {
		'--player-cue-dot': '#f59e0b',
		'--player-waveform-base': '#333333',
		'--player-waveform-buffered': '#4d4d4d',
		'--player-waveform-played': '#1c7a55',
	},
	lit: {
		'--player-cue-dot': '#fbbf24',
		'--player-waveform-base': '#cccccc',
		'--player-waveform-buffered': '#999999',
		'--player-waveform-played': '#10b981',
	},
};

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
	const item = queueItem('a', {
		durationMs: options.durationSeconds * 1000,
		waveformOverview: overview,
		...(options.cuePoints === undefined ? {} : { cuePoints: options.cuePoints }),
	});

	mounted.store.getState().playTrack([item], 'a');
	mounted.fake.callbacks.current?.onTime(options.currentTimeSeconds);

	return {
		...mounted,
		emit: (seconds: number): void => {
			mounted.fake.callbacks.current?.onTime(seconds);
		},
		seeks: () => mounted.fake.engine.seek.mock.calls.map(([seconds]) => seconds),
		slider: getByRole(mounted.part, 'slider', { name: labels.seek }),
	};
}

function painted(theme: keyof typeof themes) {
	const { '--player-waveform-base': base, '--player-waveform-played': played } = themes[theme];

	return [base, played];
}

// The readout's three spans, as a listener reads them left to right
function readout(part: HTMLElement): string | undefined {
	const label = part.querySelector<HTMLSpanElement>('.player-cue-label');

	if (!label || label.hidden) return undefined;

	return [...label.children].map((span) => span.textContent).join('|');
}

// happy-dom builds no `TimeRanges`, and the element the store hands out is the fake engine's
function stubBuffered(
	element: HTMLMediaElement,
	ranges: Array<{ end: number; start: number }>,
): void {
	Object.defineProperty(element, 'buffered', {
		configurable: true,
		value: {
			end: (index: number) => ranges[index]?.end ?? 0,
			length: ranges.length,
			start: (index: number) => ranges[index]?.start ?? 0,
		},
	});
}

// happy-dom has no 2d context and resolves no custom property; the fills record the colours in the order painted
function stubPainting() {
	const fills: Array<string> = [];
	const context = {
		beginPath: vi.fn(),
		clearRect: vi.fn(),
		clip: vi.fn(),
		fill: (_path?: Path2D) => {
			if (fills.at(-1) !== context.fillStyle) fills.push(context.fillStyle);
		},
		fillStyle: '',
		rect: vi.fn(),
		restore: vi.fn(),
		roundRect: vi.fn(),
		save: vi.fn(),
		stroke: vi.fn(),
	};

	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
		context as unknown as CanvasRenderingContext2D,
	);
	vi.stubGlobal('Path2D', StubPath2D);

	// A bar count needs layout, which happy-dom does not do
	vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
	vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(48);
	vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
		DOMRect.fromRect({ height: 48, width: 300 }),
	);
	vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
		getPropertyValue: (property: string): string => {
			const theme: Partial<Record<string, string>> =
				themes[document.documentElement.dataset.theme === 'dim' ? 'dim' : 'lit'];

			return theme[property] ?? '';
		},
	} as unknown as CSSStyleDeclaration);

	return { context, fills };
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	delete document.documentElement.dataset.theme;
});

describe('<player-time-slider>', () => {
	test('repaints in the new colours when the theme flips', async () => {
		const { fills } = stubPainting();
		const { emit } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 200 });

		fills.length = 0;
		emit(50);
		expect(fills).toStrictEqual(painted('lit'));

		fills.length = 0;
		document.documentElement.dataset.theme = 'dim';

		await vi.waitFor(() => {
			expect(fills).toStrictEqual(painted('dim'));
		});
	});

	// Each seek moves the store's position, so the next key steps from where the last one landed
	test('seeks on the slider keys and leaves anything else to the page', () => {
		stubPainting();

		const { seeks, slider } = mountSlider({ currentTimeSeconds: 50, durationSeconds: 200 });

		expect(slider.getAttribute('tabindex')).toBe('0');

		for (const key of ['ArrowRight', 'ArrowLeft', 'PageUp', 'Home', 'End', 'Enter']) {
			fireEvent.keyDown(slider, { key });
		}

		expect(seeks()).toStrictEqual([55, 50, 110, 0, 200]);
	});

	test('scrubs while a key repeats and seeks once when it is released', () => {
		stubPainting();

		const { seeks, slider } = mountSlider({ currentTimeSeconds: 50, durationSeconds: 200 });

		fireEvent.keyDown(slider, { key: 'ArrowRight' });
		fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true });
		fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true });

		expect(seeks()).toStrictEqual([55]);
		expect(slider.getAttribute('aria-valuenow')).toBe('65');

		fireEvent.keyUp(slider, { key: 'ArrowRight' });

		expect(seeks()).toStrictEqual([55, 65]);
	});

	test('clamps a seek to the track rather than running past either end', () => {
		stubPainting();

		const { seeks, slider } = mountSlider({ currentTimeSeconds: 2, durationSeconds: 30 });

		fireEvent.keyDown(slider, { key: 'PageDown' });
		fireEvent.keyDown(slider, { key: 'PageUp' });

		expect(seeks()).toStrictEqual([0, 30]);
	});

	// The box is 300 device pixels over a 3000s mix, so the played edge is worth ten seconds a pixel
	test('repaints only once the played edge reaches the next device pixel', () => {
		const { context } = stubPainting();
		const { emit } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 3000 });

		const paints = () => context.clearRect.mock.calls.length;
		const settled = paints();

		emit(1);
		emit(2);
		emit(3);
		expect(paints()).toBe(settled);

		emit(10);
		expect(paints()).toBe(settled + 1);
	});

	test('paints the cue points over the played span', () => {
		const { fills } = stubPainting();
		const { emit } = mountSlider({
			cuePoints: [cue(50)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});

		fills.length = 0;
		emit(100);

		expect(fills).toStrictEqual([...painted('lit'), themes.lit['--player-cue-dot']]);
	});

	// 100 columns at a 3px pitch put a cue at 50s on column 25, centred at x 76 and y 2
	test('seeks a press on a cue point to its start rather than to the pointer', () => {
		stubPainting();

		const { seeks, slider } = mountSlider({
			cuePoints: [cue(50)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});

		fireEvent.pointerDown(slider, { clientX: 79, clientY: 4 });
		fireEvent.pointerUp(slider);
		fireEvent.pointerDown(slider, { clientX: 150, clientY: 40 });
		fireEvent.pointerUp(slider);

		expect(seeks()).toStrictEqual([50, 100]);
	});

	test('speaks the position against the duration, once a second rather than on every tick', () => {
		stubPainting();

		const { emit, slider } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 3000 });

		expect(slider.getAttribute('aria-valuetext')).toBe('0 seconds of 50 minutes');

		emit(65.2);
		expect(slider.getAttribute('aria-valuetext')).toBe('1 minute, 5 seconds of 50 minutes');
		expect(slider.getAttribute('aria-valuenow')).toBe('65');

		emit(65.7);
		expect(slider.getAttribute('aria-valuenow')).toBe('65');

		emit(66);
		expect(slider.getAttribute('aria-valuenow')).toBe('66');
	});

	test('keeps the same canvas when the idle preview becomes the slider', () => {
		stubPainting();

		const { part, store } = mount('player-time-slider');

		store
			.getState()
			.loadQueue([queueItem('a', { durationMs: 200_000, waveformOverview: overview })]);

		const canvas = part.querySelector('canvas');

		expect(canvas?.getAttribute('aria-hidden')).toBe('true');
		expect(canvas?.hasAttribute('role')).toBe(false);

		store.getState().playAt(0);

		expect(getByRole(part, 'slider', { name: labels.seek })).toBe(canvas);
	});

	test('keeps a held scrub when the element reports its own duration mid-gesture', () => {
		stubPainting();

		const { fake, seeks, slider } = mountSlider({ currentTimeSeconds: 50, durationSeconds: 200 });

		fireEvent.pointerDown(slider, { clientX: 150, clientY: 24 });
		fake.callbacks.current?.onDuration(200.5);
		fireEvent.pointerUp(slider);

		expect(seeks()).toStrictEqual([100]);
	});

	// 300 px over a 200s mix put the pointer at half the bar on 100s, inside the Track that starts at 50s
	test('reads out the time under the pointer and the Track covering it', () => {
		stubPainting();

		const { part, slider } = mountSlider({
			cuePoints: [cue(50)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});

		fireEvent.pointerMove(slider, { clientX: 150, clientY: 24 });

		expect(readout(part)).toBe('1:40|Forest Signal|50');
		expect(part.querySelector<HTMLSpanElement>('.player-cue-label')?.style.left).toBe('150px');
	});

	// The press snaps to the cue point's start, so the readout says where the click would land rather than where the pointer is
	test('reads out a cue point at its start rather than at the pointer', () => {
		stubPainting();

		const { part, slider } = mountSlider({
			cuePoints: [cue(50)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});

		fireEvent.pointerMove(slider, { clientX: 79, clientY: 4 });

		expect(readout(part)).toBe('0:50|Forest Signal|50');
		expect(part.querySelector<HTMLSpanElement>('.player-cue-label')?.style.left).toBe('76px');
	});

	// The finger sits over the cue row the label normally hangs from
	test('reads out a held touch drag above the waveform, where the release lands', () => {
		stubPainting();
		vi.useFakeTimers();

		const { part, seeks, slider } = mountSlider({
			cuePoints: [cue(50)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});
		const label = part.querySelector<HTMLSpanElement>('.player-cue-label');

		fireEvent.pointerDown(slider, { buttons: 1, clientX: 30, clientY: 24, pointerType: 'touch' });
		vi.advanceTimersByTime(holdDelayMs);

		expect(readout(part)).toBe('0:20||');

		fireEvent.pointerMove(slider, { buttons: 1, clientX: 150, clientY: 24, pointerType: 'touch' });

		expect(readout(part)).toBe('1:40|Forest Signal|50');
		expect(label?.hasAttribute('data-above')).toBe(true);
		expect(label?.style.top).toBe('0px');

		fireEvent.pointerUp(slider, { pointerType: 'touch' });

		expect(readout(part)).toBeUndefined();
		expect(seeks()).toStrictEqual([100]);
	});

	// 30 px is 20s and 151 px is 100.67s of a 200s mix, written as the whole second a listener reads
	test('writes a held touch to the store in whole seconds and clears it on release', () => {
		stubPainting();
		vi.useFakeTimers();

		const { slider, store } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 200 });
		const preview = () => store.getState().scrubPreviewSeconds;

		fireEvent.pointerDown(slider, { buttons: 1, clientX: 30, clientY: 24, pointerType: 'touch' });

		expect(preview()).toBeUndefined();

		vi.advanceTimersByTime(holdDelayMs);

		expect(preview()).toBe(20);

		fireEvent.pointerMove(slider, { buttons: 1, clientX: 151, clientY: 24, pointerType: 'touch' });

		expect(preview()).toBe(100);

		fireEvent.pointerUp(slider, { pointerType: 'touch' });

		expect(preview()).toBeUndefined();
	});

	// Nothing on the idle preview maps a pixel to a time, so it keeps the marker label and shows no clock
	test('reads out a cue point without a time on the idle preview', () => {
		stubPainting();

		const { part, store } = mount('player-time-slider');

		store.getState().loadQueue([
			queueItem('a', {
				cuePoints: [cue(50)],
				durationMs: 200_000,
				waveformOverview: overview,
			}),
		]);

		const canvas = part.querySelector('canvas');

		expect(canvas).not.toBeNull();

		fireEvent.pointerMove(canvas!, { clientX: 150, clientY: 24 });
		expect(readout(part)).toBeUndefined();

		fireEvent.pointerMove(canvas!, { clientX: 79, clientY: 4 });
		expect(readout(part)).toBe('|Forest Signal|50');
	});

	// 20s and the span from 100s to 140s of a 200s mix land on 0 to 30 and 150 to 210 of a 300 px bar
	test('paints every buffered range rather than the furthest end alone', () => {
		const { context, fills } = stubPainting();
		const { fake } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 200 });

		stubBuffered(fake.engine.element, [
			{ end: 20, start: 0 },
			{ end: 140, start: 100 },
		]);
		context.rect.mockClear();
		fills.length = 0;
		fake.engine.element.dispatchEvent(new Event('progress'));

		expect(context.rect.mock.calls).toStrictEqual([
			[0, 0, 30, 48],
			[150, 0, 60, 48],
		]);
		expect(fills).toStrictEqual([
			themes.lit['--player-waveform-base'],
			themes.lit['--player-waveform-buffered'],
		]);
	});

	// A range grows continuously while a stream loads, and most of that growth moves no device pixel
	test('repaints on progress only once a buffered edge reaches the next device pixel', () => {
		const { context } = stubPainting();
		const { fake } = mountSlider({ currentTimeSeconds: 0, durationSeconds: 3000 });

		const paints = () => context.clearRect.mock.calls.length;

		stubBuffered(fake.engine.element, [{ end: 100, start: 0 }]);
		fake.engine.element.dispatchEvent(new Event('progress'));

		const settled = paints();

		fake.engine.element.dispatchEvent(new Event('progress'));
		expect(paints()).toBe(settled);

		stubBuffered(fake.engine.element, [{ end: 110, start: 0 }]);
		fake.engine.element.dispatchEvent(new Event('progress'));
		expect(paints()).toBe(settled + 1);
	});

	test('falls back to a range input for an item measured without peaks', () => {
		const { fake, part, store } = mount('player-time-slider');

		store.getState().playTrack([queueItem('a')], 'a');

		const range = getByRole<HTMLInputElement>(part, 'slider', { name: labels.seek });

		expect(range.disabled).toBe(true);

		fake.callbacks.current?.onDuration(200);
		range.value = '42';
		fireEvent.input(range);

		expect(range.disabled).toBe(false);
		expect(fake.engine.seek).toHaveBeenLastCalledWith(42);
	});
});
