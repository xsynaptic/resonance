import { useEffect, useRef, useSyncExternalStore } from 'react';

import { joinClassNames } from '#lib/class-names.ts';
import { getThemeVersion, subscribeTheme } from '#waveform/theme-version.ts';
import { paintWaveform, prepareRendering } from '#waveform/waveform-render.ts';

export function WaveformPreview({
	className,
	overview,
}: {
	className?: string | undefined;
	overview: ReadonlyArray<number>;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const themeVersion = useSyncExternalStore(subscribeTheme, getThemeVersion, zeroVersion);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;

		const paint = (): void => {
			const rendering = prepareRendering(canvas, overview);
			if (rendering === undefined) return;

			canvas.width = rendering.width;
			canvas.height = rendering.height;

			paintWaveform(context, rendering, 0);
		};

		// Observing paints once on its own, which is the first paint
		const observer = new ResizeObserver(paint);

		observer.observe(canvas);

		return () => {
			observer.disconnect();
		};
	}, [overview, themeVersion]);

	return (
		<canvas
			aria-hidden="true"
			className={joinClassNames('player-waveform player-waveform-inert', className)}
			ref={canvasRef}
		/>
	);
}

function zeroVersion(): number {
	return 0;
}
