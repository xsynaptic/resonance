import { fireEvent, getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { QueueCuePoint } from '#types.ts';

import { labels } from '#components/test-labels.ts';
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
		'--player-waveform-played': '#1c7a55',
	},
	lit: {
		'--player-cue-dot': '#fbbf24',
		'--player-waveform-base': '#cccccc',
		'--player-waveform-played': '#10b981',
	},
};

const overview = [0.4, 0.8, 0.6, 0.2];

function cue(startSeconds: number): QueueCuePoint {
	return { artistLine: '', startSeconds, title: String(startSeconds) };
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

// happy-dom has no 2d context and resolves no custom property; the fills record the colours in the order painted
function stubPainting(tokens: Partial<Record<string, string>> = {}) {
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

			return tokens[property] ?? theme[property] ?? '';
		},
	} as unknown as CSSStyleDeclaration);

	return { context, fills };
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
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

	// A 12px cue point on column 25 is centred at x 76 and y 6, so a press 8px off still lands within half its size plus the margin
	test('reaches a cue point by the size the theme gives it', () => {
		stubPainting({ '--player-cue-size': '12px' });

		const { seeks, slider } = mountSlider({
			cuePoints: [cue(50)],
			currentTimeSeconds: 0,
			durationSeconds: 200,
		});

		fireEvent.pointerDown(slider, { clientX: 84, clientY: 6 });
		fireEvent.pointerUp(slider);

		expect(seeks()).toStrictEqual([50]);
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
