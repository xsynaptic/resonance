import { useEffect, useRef } from 'react';

import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';

// An oscilloscope trace of the analyser's time-domain data; the loop runs only while playing and visible
export function SignalDisplay({ className }: { className?: string | undefined }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const isPlaying = usePlayer((state) => state.status === 'playing');
	const getAnalyser = usePlayer((state) => state.getAnalyser);

	useEffect(() => {
		if (!isPlaying) return;

		const analyser = getAnalyser();
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!analyser || !canvas || !context) return;

		const samples = new Uint8Array(analyser.fftSize);

		// Read once: getPropertyValue forces a style recalc, and this loop runs at the display's refresh rate
		const accent = getComputedStyle(canvas).getPropertyValue('--player-accent');

		// Reassigning width resets the transform, so size first and then set it
		const sizeCanvas = (): void => {
			const ratio = window.devicePixelRatio || 1;

			canvas.width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
			canvas.height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
		};

		sizeCanvas();

		const observer = new ResizeObserver(sizeCanvas);

		observer.observe(canvas);

		let frame = 0;

		const render = (): void => {
			frame = requestAnimationFrame(render);
			if (document.hidden) return;

			// Don't draw the scope without enough room to do so
			const width = canvas.clientWidth;
			if (width === 0) return;

			analyser.getByteTimeDomainData(samples);

			const height = canvas.clientHeight;

			context.clearRect(0, 0, width, height);
			context.lineWidth = 1.5;
			context.strokeStyle = accent;
			context.beginPath();

			for (const [index, sample] of samples.entries()) {
				const x = (index / samples.length) * width;
				const y = (sample / 128) * (height / 2);

				if (index === 0) context.moveTo(x, y);
				else context.lineTo(x, y);
			}

			context.stroke();
		};

		frame = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}, [getAnalyser, isPlaying]);

	return (
		<canvas
			aria-hidden="true"
			className={joinClassNames('player-scope', className)}
			ref={canvasRef}
		/>
	);
}
