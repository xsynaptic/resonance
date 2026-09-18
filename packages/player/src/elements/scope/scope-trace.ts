import { observeResize } from '#lib/observe-resize.ts';

export type FillColumns = (frameMs: number, columns: ScopeColumns) => void;

interface ScopeColumns {
	count: number;
	// Columns before this one draw as heard, the rest as still to come
	heardCount: number;
	// Each column's span runs from -1 to 1, up positive
	highest: Float32Array;
	lowest: Float32Array;
}

interface ScopeSize {
	height: number;
	ratio: number;
	width: number;
}

export function traceScope(
	canvas: HTMLCanvasElement,
	fillColumns: FillColumns,
	signal: AbortSignal,
): void {
	const context = canvas.getContext('2d');
	if (!context) return;

	// Read once: getPropertyValue forces a style recalc, and this loop runs at the display's refresh rate
	const style = getComputedStyle(canvas);
	const heardStyle = style.getPropertyValue('--player-waveform-played');
	const comingStyle = style.getPropertyValue('--player-waveform-base');

	// Measured on resize rather than per frame, where reading either would force a layout 60 times a second
	const size: ScopeSize = { height: 0, ratio: 1, width: 0 };
	const columns: ScopeColumns = {
		count: 0,
		heardCount: 0,
		highest: new Float32Array(0),
		lowest: new Float32Array(0),
	};
	let frame = 0;

	const strokeColumns = (from: number, to: number, strokeStyle: string): void => {
		const thickness = 1 / size.ratio;
		const centre = size.height / 2;

		context.strokeStyle = strokeStyle;
		context.beginPath();

		for (let column = from; column < to; column += 1) {
			// Half a device pixel over, so a one-pixel stroke lands on the column rather than straddling two
			const x = (column + 0.5) * thickness;
			const top = centre - (columns.highest[column] ?? 0) * centre;
			const bottom = centre - (columns.lowest[column] ?? 0) * centre;

			// Silence has no span of its own, and the centre line still has to be drawn
			const span = Math.max(bottom - top, thickness);

			context.moveTo(x, top);
			context.lineTo(x, top + span);
		}

		context.stroke();
	};

	const render = (frameMs: number): void => {
		frame = requestAnimationFrame(render);

		fillColumns(frameMs, columns);

		context.clearRect(0, 0, size.width, size.height);
		context.lineWidth = 1 / size.ratio;
		strokeColumns(0, columns.heardCount, heardStyle);
		if (columns.heardCount < columns.count) {
			strokeColumns(columns.heardCount, columns.count, comingStyle);
		}
	};

	// A scope with no columns is hidden by a container query, and a hidden document presents no frames
	const restart = (): void => {
		cancelAnimationFrame(frame);
		frame = columns.count > 0 && !document.hidden ? requestAnimationFrame(render) : 0;
	};

	// Reassigning width resets the transform, so size first and then set it
	const sizeCanvas = (): void => {
		size.ratio = window.devicePixelRatio || 1;
		size.width = canvas.clientWidth;
		size.height = canvas.clientHeight;
		columns.count = Math.floor(size.width * size.ratio);
		columns.highest = new Float32Array(columns.count);
		columns.lowest = new Float32Array(columns.count);
		canvas.width = Math.max(1, columns.count);
		canvas.height = Math.max(1, Math.floor(size.height * size.ratio));
		context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);

		restart();
	};

	sizeCanvas();

	observeResize(canvas, sizeCanvas, signal);
	document.addEventListener('visibilitychange', restart, { signal });
	signal.addEventListener(
		'abort',
		() => {
			cancelAnimationFrame(frame);
		},
		{ once: true },
	);
}
