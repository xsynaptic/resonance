import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi, useSubscribeTime } from '#store/context.tsx';
import { displayedItem, isLoaded } from '#store/selectors.ts';
import { WaveformCanvas } from '#waveform/waveform-canvas.tsx';
import { WaveformPreview } from '#waveform/waveform-preview.tsx';

// Split so each branch owns its own subscriptions: the waveform takes none for the clock, the range input does
export function SeekBar({ className, label }: { className?: string | undefined; label: string }) {
	const item = usePlayer(displayedItem);
	const isTrackLoaded = usePlayer(isLoaded);

	if (item?.waveformOverview === undefined)
		return <RangeSeek className={className} label={label} />;

	if (!isTrackLoaded)
		return <WaveformPreview className={className} overview={item.waveformOverview} />;

	return <WaveformSeek className={className} label={label} overview={item.waveformOverview} />;
}

function RangeSeek({ className, label }: { className?: string | undefined; label: string }) {
	const currentTimeSeconds = usePlayer((state) => state.currentTimeSeconds);
	const durationSeconds = usePlayer((state) => state.durationSeconds);
	const store = usePlayerStoreApi();

	return (
		<input
			aria-label={label}
			className={joinClassNames('player-seek', className)}
			disabled={durationSeconds === undefined}
			max={durationSeconds ?? 0}
			min={0}
			onChange={(event) => {
				store.getState().seek(Number(event.target.value));
			}}
			step={0.1}
			type="range"
			value={durationSeconds === undefined ? 0 : Math.min(currentTimeSeconds, durationSeconds)}
		/>
	);
}

function WaveformSeek({
	className,
	label,
	overview,
}: {
	className?: string | undefined;
	label: string;
	overview: ReadonlyArray<number>;
}) {
	const durationSeconds = usePlayer((state) => state.durationSeconds);
	const store = usePlayerStoreApi();
	const subscribeTime = useSubscribeTime();

	return (
		<WaveformCanvas
			className={className}
			durationSeconds={durationSeconds}
			label={label}
			onSeek={(seconds) => {
				store.getState().seek(seconds);
			}}
			overview={overview}
			subscribeTime={subscribeTime}
		/>
	);
}
