import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { WaveformCanvas } from '#waveform/waveform-canvas.tsx';

// Vitest wants a constructible stub, and the renderer never reads back from the path it builds
class StubPath2D {
	closePath = vi.fn();
	lineTo = vi.fn();
	moveTo = vi.fn();
	rect = vi.fn();
	roundRect = vi.fn();
}

const themes = {
	dim: { '--player-waveform-played': '#1c7a55', '--player-waveform-track': '#333333' },
	lit: { '--player-waveform-played': '#10b981', '--player-waveform-track': '#cccccc' },
};

// The whole waveform is laid down in the track colour and the played part clipped over it
function painted(theme: keyof typeof themes) {
	const { '--player-waveform-played': played, '--player-waveform-track': track } = themes[theme];

	return [track, played];
}

function renderCanvas(props: { currentTimeS: number; durationS: number; seeks?: Array<number> }) {
	const listeners = new Set<(currentTimeS: number) => void>();

	render(
		<WaveformCanvas
			durationS={props.durationS}
			label="Seek"
			onSeek={(seconds) => {
				props.seeks?.push(seconds);
			}}
			overview={[0.4, 0.8, 0.6, 0.2]}
			subscribeTime={(onTime) => {
				onTime(props.currentTimeS);
				listeners.add(onTime);

				return () => {
					listeners.delete(onTime);
				};
			}}
		/>,
	);

	return (currentTimeS: number): void => {
		for (const listener of listeners) listener(currentTimeS);
	};
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
	};

	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
		context as unknown as CanvasRenderingContext2D,
	);

	// happy-dom has no Path2D either; the renderer only builds a path and hands it to `fill`
	vi.stubGlobal('Path2D', StubPath2D);

	// A bar count needs layout, which happy-dom does not do; the box is stubbed so the geometry resolves
	vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
	vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(48);

	// The renderer also reads the pitch tokens, which no theme here declares; those fall back to the defaults
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
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	delete document.documentElement.dataset.theme;
});

describe('WaveformCanvas', () => {
	test('repaints in the new colours when the theme flips', async () => {
		const { fills } = stubPainting();

		renderCanvas({ currentTimeS: 50, durationS: 200 });
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

		renderCanvas({ currentTimeS: 50, durationS: 200, seeks });

		const slider = screen.getByRole('slider');

		expect(slider.getAttribute('tabindex')).toBe('0');

		for (const key of ['ArrowRight', 'ArrowLeft', 'PageUp', 'Home', 'End', 'Enter']) {
			fireEvent.keyDown(slider, { key });
		}

		expect(seeks).toStrictEqual([55, 45, 110, 0, 200]);
	});

	test('clamps a seek to the track rather than running past either end', () => {
		stubPainting();

		const seeks: Array<number> = [];

		renderCanvas({ currentTimeS: 2, durationS: 30, seeks });

		const slider = screen.getByRole('slider');

		fireEvent.keyDown(slider, { key: 'PageDown' });
		fireEvent.keyDown(slider, { key: 'PageUp' });

		expect(seeks).toStrictEqual([0, 30]);
	});

	// The box is 300 device pixels over a 3000s mix, so the played edge is worth ten seconds a pixel
	test('repaints only once the played edge reaches the next device pixel', () => {
		const { context } = stubPainting();
		const emit = renderCanvas({ currentTimeS: 0, durationS: 3000 });

		const paints = () => context.clearRect.mock.calls.length;
		const settled = paints();

		emit(1);
		emit(2);
		emit(3);
		expect(paints()).toBe(settled);

		emit(10);
		expect(paints()).toBe(settled + 1);
	});

	test('announces the position once a second rather than on every tick', () => {
		stubPainting();

		const emit = renderCanvas({ currentTimeS: 0, durationS: 3000 });
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
