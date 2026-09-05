import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi, useSubscribeTime } from '#store/context.tsx';
import { WaveformCanvas } from '#waveform/waveform-canvas.tsx';

// Split so each branch owns its own subscriptions: the waveform takes none for the clock, the range input does
export function SeekBar({ className, label }: { className?: string | undefined; label: string }) {
	const urls = usePlayer((state) => state.urls);
	const current = usePlayer((state) =>
		state.currentIndex === undefined ? undefined : state.queue[state.currentIndex],
	);

	if (urls && current?.waveformOverview)
		return (
			<WaveformSeek
				className={className}
				label={label}
				overview={current.waveformOverview}
				resolveWaveform={urls.waveform}
				trackId={current.trackId}
			/>
		);

	return <RangeSeek className={className} label={label} />;
}

function RangeSeek({ className, label }: { className?: string | undefined; label: string }) {
	const currentTimeS = usePlayer((state) => state.currentTimeS);
	const durationS = usePlayer((state) => state.durationS);
	const store = usePlayerStoreApi();

	return (
		<input
			aria-label={label}
			className={joinClassNames('player-seek', className)}
			disabled={durationS === undefined}
			max={durationS ?? 0}
			min={0}
			onChange={(event) => {
				store.getState().seek(Number(event.target.value));
			}}
			step={0.1}
			type="range"
			value={durationS === undefined ? 0 : Math.min(currentTimeS, durationS)}
		/>
	);
}

function WaveformSeek({
	className,
	label,
	overview,
	resolveWaveform,
	trackId,
}: {
	className?: string | undefined;
	label: string;
	overview: ReadonlyArray<number>;
	resolveWaveform: (trackId: string) => Promise<string | undefined>;
	trackId: string;
}) {
	const durationS = usePlayer((state) => state.durationS);
	const store = usePlayerStoreApi();
	const subscribeTime = useSubscribeTime();

	return (
		<WaveformCanvas
			className={className}
			durationS={durationS}
			label={label}
			onSeek={(seconds) => {
				store.getState().seek(seconds);
			}}
			overview={overview}
			resolveWaveform={resolveWaveform}
			subscribeTime={subscribeTime}
			trackId={trackId}
		/>
	);
}
