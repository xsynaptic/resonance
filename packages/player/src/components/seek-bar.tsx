import type { QueueCuePoint, QueuedItem } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { usePlayer, usePlayerStoreApi, useSubscribeTime } from '#store/context.tsx';
import { displayedItem, isLoaded } from '#store/selectors.ts';
import { WaveformCanvas } from '#waveform/waveform-canvas.tsx';
import { WaveformCues } from '#waveform/waveform-cues.tsx';
import { WaveformPreview } from '#waveform/waveform-preview.tsx';

// Split so each branch owns its own subscriptions: the waveform takes none for the clock, the range input does
export function SeekBar({ className, label }: { className?: string | undefined; label: string }) {
	const item = usePlayer(displayedItem);
	const isTrackLoaded = usePlayer(isLoaded);

	if (item?.waveformOverview === undefined)
		return <RangeSeek className={className} label={label} />;

	return (
		<div className={joinClassNames('player-waveform-frame', className)}>
			{isTrackLoaded ? (
				<WaveformSeek label={label} overview={item.waveformOverview} />
			) : (
				<WaveformPreview overview={item.waveformOverview} />
			)}
			{item.cuePoints === undefined ? undefined : (
				<SeekCues cuePoints={item.cuePoints} isTrackLoaded={isTrackLoaded} item={item} />
			)}
		</div>
	);
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

// Mapped against the item's own duration, the span the overview's peaks were measured over
function SeekCues({
	cuePoints,
	isTrackLoaded,
	item,
}: {
	cuePoints: ReadonlyArray<QueueCuePoint>;
	isTrackLoaded: boolean;
	item: QueuedItem;
}) {
	const store = usePlayerStoreApi();

	return (
		<WaveformCues
			cuePoints={cuePoints}
			durationSeconds={toDurationSeconds(item)}
			onSeek={
				isTrackLoaded
					? (seconds) => {
							store.getState().seek(seconds);
						}
					: undefined
			}
		/>
	);
}

function WaveformSeek({ label, overview }: { label: string; overview: ReadonlyArray<number> }) {
	const durationSeconds = usePlayer((state) => state.durationSeconds);
	const store = usePlayerStoreApi();
	const subscribeTime = useSubscribeTime();

	return (
		<WaveformCanvas
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
