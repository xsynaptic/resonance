import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { QueueCuePoint } from '#types.ts';

import { WaveformCanvas } from '#waveform/waveform-canvas.tsx';

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

function cue(startSeconds: number): QueueCuePoint {
	return { artistLine: '', startSeconds, title: String(startSeconds) };
}

// The whole waveform is laid down in the base colour and the played part clipped over it
function painted(theme: keyof typeof themes) {
	const { '--player-waveform-base': base, '--player-waveform-played': played } = themes[theme];

	return [base, played];
}

function renderCanvas(props: {
	cuePoints?: Array<QueueCuePoint>;
	currentTimeSeconds: number;
	durationSeconds: number;
	seeks?: Array<number>;
}) {
	const listeners = new Set<(currentTimeSeconds: number) => void>();

	render(
		<WaveformCanvas
			cueDurationSeconds={props.durationSeconds}
			cuePoints={props.cuePoints}
			durationSeconds={props.durationSeconds}
			label="Seek"
			onSeek={(seconds) => {
				props.seeks?.push(seconds);
			}}
			overview={[0.4, 0.8, 0.6, 0.2]}
			subscribeTime={(onTime) => {
				onTime(props.currentTimeSeconds);
				listeners.add(onTime);

				return () => {
					listeners.delete(onTime);
				};
			}}
		/>,
	);

	return (currentTimeSeconds: number): void => {
		for (const listener of listeners) listener(currentTimeSeconds);
	};
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

	// happy-dom has no Path2D either; the renderer only builds a path and hands it to `fill`
	vi.stubGlobal('Path2D', StubPath2D);

	// A bar count needs layout, which happy-dom does not do; the box is stubbed so the geometry resolves
	vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
	vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(48);
	vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
		DOMRect.fromRect({ height: 48, width: 300 }),
	);

	// The renderer also reads the pitch tokens, which no theme here declares; those fall back to the defaults
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
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	delete document.documentElement.dataset.theme;
});

describe('WaveformCanvas', () => {
	test('repaints in the new colours when the theme flips', async () => {
		const { fills } = stubPainting();

		renderCanvas({ currentTimeSeconds: 50, durationSeconds: 200 });
		expect(fills).toStrictEqual(painted('lit'));

		fills.length = 0;
		document.documentElement.dataset.theme = 'dim';

		await waitFor(() => {
			expect(fills).toStrictEqual(painted('dim'));
		});
	});

	test('seeks on the slider keys and leaves anything else to the page', () => {
		stubPainting();

		const seeks: Array<number> = [];

		renderCanvas({ currentTimeSeconds: 50, durationSeconds: 200, seeks });

		const slider = screen.getByRole('slider');

		expect(slider.getAttribute('tabindex')).toBe('0');

		for (const key of ['ArrowRight', 'ArrowLeft', 'PageUp', 'Home', 'End', 'Enter']) {
			fireEvent.keyDown(slider, { key });
		}

		expect(seeks).toStrictEqual([55, 45, 110, 0, 200]);
	});

	test('scrubs while a key repeats and seeks once when it is released', () => {
		stubPainting();

		const seeks: Array<number> = [];

		renderCanvas({ currentTimeSeconds: 50, durationSeconds: 200, seeks });

		const slider = screen.getByRole('slider');

		fireEvent.keyDown(slider, { key: 'ArrowRight' });
		fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true });
		fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true });

		expect(seeks).toStrictEqual([55]);
		expect(slider.getAttribute('aria-valuetext')).toBe('1:00');

		fireEvent.keyUp(slider, { key: 'ArrowRight' });

		expect(seeks).toStrictEqual([55, 60]);
	});

	test('clamps a seek to the track rather than running past either end', () => {
		stubPainting();

		const seeks: Array<number> = [];

		renderCanvas({ currentTimeSeconds: 2, durationSeconds: 30, seeks });

		const slider = screen.getByRole('slider');

		fireEvent.keyDown(slider, { key: 'PageDown' });
		fireEvent.keyDown(slider, { key: 'PageUp' });

		expect(seeks).toStrictEqual([0, 30]);
	});

	// The box is 300 device pixels over a 3000s mix, so the played edge is worth ten seconds a pixel
	test('repaints only once the played edge reaches the next device pixel', () => {
		const { context } = stubPainting();
		const emit = renderCanvas({ currentTimeSeconds: 0, durationSeconds: 3000 });

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

		renderCanvas({ cuePoints: [cue(50)], currentTimeSeconds: 100, durationSeconds: 200 });

		expect(fills).toStrictEqual([...painted('lit'), themes.lit['--player-cue-dot']]);
	});

	// 100 columns at a 3px pitch put a cue at 50s on column 25, centred at x 76 and y 2
	test('seeks a press on a cue point to its start rather than to the pointer', () => {
		stubPainting();

		const seeks: Array<number> = [];

		renderCanvas({ cuePoints: [cue(50)], currentTimeSeconds: 0, durationSeconds: 200, seeks });

		const slider = screen.getByRole('slider');

		fireEvent.pointerDown(slider, { clientX: 79, clientY: 4 });
		fireEvent.pointerUp(slider);
		fireEvent.pointerDown(slider, { clientX: 150, clientY: 40 });
		fireEvent.pointerUp(slider);

		expect(seeks).toStrictEqual([50, 100]);
	});

	// A 12px cue point on column 25 is centred at x 76 and y 6, so a press 8px off still lands within half its size plus the margin
	test('reaches a cue point by the size the theme gives it', () => {
		stubPainting({ '--player-cue-size': '12px' });

		const seeks: Array<number> = [];

		renderCanvas({ cuePoints: [cue(50)], currentTimeSeconds: 0, durationSeconds: 200, seeks });

		const slider = screen.getByRole('slider');

		fireEvent.pointerDown(slider, { clientX: 84, clientY: 6 });
		fireEvent.pointerUp(slider);

		expect(seeks).toStrictEqual([50]);
	});

	test('announces the position once a second rather than on every tick', () => {
		stubPainting();

		const emit = renderCanvas({ currentTimeSeconds: 0, durationSeconds: 3000 });
		const slider = screen.getByRole('slider');

		emit(65.2);
		expect(slider.getAttribute('aria-valuetext')).toBe('1:05');
		expect(slider.getAttribute('aria-valuenow')).toBe('65');

		emit(65.7);
		expect(slider.getAttribute('aria-valuenow')).toBe('65');

		emit(66);
		expect(slider.getAttribute('aria-valuenow')).toBe('66');
	});
});
