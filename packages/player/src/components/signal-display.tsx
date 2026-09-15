import { useEffect, useRef } from 'react';

import { joinClassNames } from '#lib/class-names.ts';
import { traceSignal } from '#lib/scope-trace.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

// The loop runs only while playing and visible
export function SignalDisplay({ className }: { className?: string | undefined }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const isPlaying = usePlayer((state) => state.status === 'playing' && !state.isOverlayOpen);
	const store = usePlayerStoreApi();

	useEffect(() => {
		if (!isPlaying) return;

		const analyser = store.getState().getAnalyser();
		const canvas = canvasRef.current;
		if (!analyser || !canvas) return;

		const trace = new AbortController();

		traceSignal(canvas, analyser, trace.signal);

		return () => {
			trace.abort();
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
