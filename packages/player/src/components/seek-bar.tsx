import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';
import { WaveformCanvas } from '#waveform/waveform-canvas.tsx';

export function SeekBar({ className, label }: { className?: string | undefined; label: string }) {
	const currentTimeS = usePlayer((state) => state.currentTimeS);
	const durationS = usePlayer((state) => state.durationS);
	const seek = usePlayer((state) => state.seek);
	const urls = usePlayer((state) => state.urls);
	const current = usePlayer((state) =>
		state.currentIndex === undefined ? undefined : state.queue[state.currentIndex],
	);

	if (urls && current?.waveformOverview) {
		return (
			<WaveformCanvas
				className={className}
				currentTimeS={currentTimeS}
				durationS={durationS}
				label={label}
				onSeek={seek}
				overview={current.waveformOverview}
				resolveWaveform={urls.waveform}
				trackId={current.trackId}
			/>
		);
	}

	return (
		<input
			aria-label={label}
			className={joinClassNames('player-seek', className)}
			disabled={durationS === undefined}
			max={durationS ?? 0}
			min={0}
			onChange={(event) => {
				seek(Number(event.target.value));
			}}
			step={0.1}
			type="range"
			value={durationS === undefined ? 0 : Math.min(currentTimeS, durationS)}
		/>
	);
}
