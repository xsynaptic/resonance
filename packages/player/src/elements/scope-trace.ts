import { bucketBounds } from '#lib/bucket-bounds.ts';
import { observeResize } from '#lib/observe-resize.ts';

interface ScopeSize {
	columns: number;
	height: number;
	ratio: number;
	width: number;
}

// An oscilloscope trace of the analyser's time-domain data, drawn every frame until the signal aborts
export function traceSignal(
	canvas: HTMLCanvasElement,
	analyser: AnalyserNode,
	signal: AbortSignal,
): void {
	const context = canvas.getContext('2d');
	if (!context) return;

	const samples = new Uint8Array(analyser.fftSize);

	// Read once: getPropertyValue forces a style recalc, and this loop runs at the display's refresh rate
	const traceStyle = getComputedStyle(canvas).getPropertyValue('--player-waveform-played');

	// Measured on resize rather than per frame, where reading either would force a layout 60 times a second
	const size: ScopeSize = { columns: 0, height: 0, ratio: 1, width: 0 };
	let frame = 0;

	const render = (): void => {
		frame = requestAnimationFrame(render);
		if (document.hidden) return;

		analyser.getByteTimeDomainData(samples);

		const thickness = 1 / size.ratio;

		context.clearRect(0, 0, size.width, size.height);
		context.lineWidth = thickness;
		context.strokeStyle = traceStyle;
		context.beginPath();

		for (let column = 0; column < size.columns; column += 1) {
			const { highest, lowest } = columnRange(samples, column, size.columns);

			// Half a device pixel over, so a one-pixel stroke lands on the column rather than straddling two
			const x = (column + 0.5) * thickness;
			const top = (lowest / 128) * (size.height / 2);
			const bottom = (highest / 128) * (size.height / 2);

			// Silence has no span of its own, and the centre line still has to be drawn
			const span = Math.max(bottom - top, thickness);

			context.moveTo(x, top);
			context.lineTo(x, top + span);
		}

		context.stroke();
	};

	// Reassigning width resets the transform, so size first and then set it
	const sizeCanvas = (): void => {
		size.ratio = window.devicePixelRatio || 1;
		size.width = canvas.clientWidth;
		size.height = canvas.clientHeight;
		size.columns = Math.floor(size.width * size.ratio);
		canvas.width = Math.max(1, size.columns);
		canvas.height = Math.max(1, Math.floor(size.height * size.ratio));
		context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);

		// A hidden scope has no columns, so its loop stops until the observer sees it take width again
		cancelAnimationFrame(frame);
		frame = size.columns > 0 ? requestAnimationFrame(render) : 0;
	};

	sizeCanvas();

	observeResize(canvas, sizeCanvas, signal);
	signal.addEventListener(
		'abort',
		() => {
			cancelAnimationFrame(frame);
		},
		{ once: true },
	);
}

function columnRange(samples: Uint8Array, column: number, columns: number) {
	const { end, start } = bucketBounds(samples.length, column, columns);

	let lowest = 255;
	let highest = 0;

	for (let index = start; index < end; index += 1) {
		const sample = samples[index] ?? 128;

		if (sample < lowest) lowest = sample;
		if (sample > highest) highest = sample;
	}

	return { highest, lowest };
}
