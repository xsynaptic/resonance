import { useEffect, useRef } from 'react';

import type { QueueCuePoint } from '#types.ts';

import { useOverviewRendering } from '#waveform/use-overview-rendering.tsx';
import { paintWaveform } from '#waveform/waveform-render.ts';

interface WaveformPreviewProps {
	cueDurationSeconds: number | undefined;
	cuePoints: ReadonlyArray<QueueCuePoint> | undefined;
	overview: ReadonlyArray<number>;
}

export function WaveformPreview({ cueDurationSeconds, cuePoints, overview }: WaveformPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { label, onPointerLeave, onPointerMove, rebuild, themeVersion } = useOverviewRendering({
		cueDurationSeconds,
		cuePoints,
		overview,
	});

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		// Observing paints once on its own, which is the first paint
		const observer = new ResizeObserver(() => {
			const rendering = rebuild(canvas);

			if (rendering !== undefined) paintWaveform(rendering, 0);
		});

		observer.observe(canvas);

		return () => {
			observer.disconnect();
		};
	}, [rebuild, themeVersion]);

	return (
		<>
			<canvas
				aria-hidden="true"
				className="player-waveform player-waveform-inert"
				onPointerLeave={onPointerLeave}
				onPointerMove={onPointerMove}
				ref={canvasRef}
			/>
			{label}
		</>
	);
}
