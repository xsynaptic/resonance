import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { WaveformCanvas } from '#waveform/waveform-canvas.tsx';

const resolveNothing = () => Promise.resolve(undefined);

const themes = {
	dim: { '--player-accent': '#1c7a55', '--player-waveform-track': '#333333' },
	lit: { '--player-accent': '#10b981', '--player-waveform-track': '#cccccc' },
};

// A quarter of the way in over four buckets: two bars played, two not
function painted(theme: keyof typeof themes) {
	const { '--player-accent': played, '--player-waveform-track': track } = themes[theme];

	return [played, played, track, track];
}

function renderCanvas(props: { currentTimeS: number; durationS: number; seeks?: Array<number> }) {
	render(
		<WaveformCanvas
			currentTimeS={props.currentTimeS}
			durationS={props.durationS}
			label="Seek"
			onSeek={(seconds) => {
				props.seeks?.push(seconds);
			}}
			overview={[0.4, 0.8, 0.6, 0.2]}
			resolveWaveform={resolveNothing}
			trackId="fixture"
		/>,
	);
}

// happy-dom has no 2d context and resolves no custom property; the fills record what was painted
function stubPainting() {
	const fills: Array<string> = [];
	const context = {
		clearRect: vi.fn(),
		fillRect: () => {
			fills.push(context.fillStyle);
		},
		fillStyle: '',
		scale: vi.fn(),
	};

	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
		context as unknown as CanvasRenderingContext2D,
	);
	vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
		getPropertyValue: (property: string) =>
			themes[document.documentElement.dataset.theme === 'dim' ? 'dim' : 'lit'][
				property as keyof (typeof themes)['lit']
			],
	} as unknown as CSSStyleDeclaration);

	return fills;
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	delete document.documentElement.dataset.theme;
});

describe('WaveformCanvas', () => {
	test('repaints in the new colours when the theme flips', async () => {
		const fills = stubPainting();

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
});
