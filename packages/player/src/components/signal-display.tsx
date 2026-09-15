import { useEffect, useRef } from 'react';

import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

// An oscilloscope trace of the analyser's time-domain data; the loop runs only while playing and visible
export function SignalDisplay({ className }: { className?: string | undefined }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const isPlaying = usePlayer((state) => state.status === 'playing' && !state.isOverlayOpen);
	const store = usePlayerStoreApi();

	useEffect(() => {
		if (!isPlaying) return;

		const analyser = store.getState().getAnalyser();
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!analyser || !canvas || !context) return;

		const samples = new Uint8Array(analyser.fftSize);

		// Read once: getPropertyValue forces a style recalc, and this loop runs at the display's refresh rate
		const traceStyle = getComputedStyle(canvas).getPropertyValue('--player-waveform-played');

		// Measured on resize rather than per frame, where reading either would force a layout 60 times a second
		let ratio = 1;
		let width = 0;
		let height = 0;
		let columns = 0;
		let frame = 0;

		const render = (): void => {
			frame = requestAnimationFrame(render);
			if (document.hidden) return;

			analyser.getByteTimeDomainData(samples);

			const thickness = 1 / ratio;

			context.clearRect(0, 0, width, height);
			context.lineWidth = thickness;
			context.strokeStyle = traceStyle;
			context.beginPath();

			for (let column = 0; column < columns; column += 1) {
				const start = Math.floor((column * samples.length) / columns);
				const end = Math.max(start + 1, Math.floor(((column + 1) * samples.length) / columns));

				let lowest = 255;
				let highest = 0;

				for (let index = start; index < end; index += 1) {
					const sample = samples[index] ?? 128;

					if (sample < lowest) lowest = sample;
					if (sample > highest) highest = sample;
				}

				// Half a device pixel over, so a one-pixel stroke lands on the column rather than straddling two
				const x = (column + 0.5) * thickness;
				const top = (lowest / 128) * (height / 2);
				const bottom = (highest / 128) * (height / 2);

				// Silence has no span of its own, and the centre line still has to be drawn
				const span = Math.max(bottom - top, thickness);

				context.moveTo(x, top);
				context.lineTo(x, top + span);
			}

			context.stroke();
		};

		// Reassigning width resets the transform, so size first and then set it
		const sizeCanvas = (): void => {
			ratio = window.devicePixelRatio || 1;
			width = canvas.clientWidth;
			height = canvas.clientHeight;
			columns = Math.floor(width * ratio);
			canvas.width = Math.max(1, columns);
			canvas.height = Math.max(1, Math.floor(height * ratio));
			context.setTransform(ratio, 0, 0, ratio, 0, 0);

			// A hidden scope has no columns, so its loop stops until the observer sees it take width again
			cancelAnimationFrame(frame);
			frame = columns > 0 ? requestAnimationFrame(render) : 0;
		};

		sizeCanvas();

		const observer = new ResizeObserver(sizeCanvas);

		observer.observe(canvas);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}, [isPlaying, store]);

	return (
		<canvas
			aria-hidden="true"
			className={joinClassNames('player-scope', className)}
			ref={canvasRef}
		/>
	);
}
