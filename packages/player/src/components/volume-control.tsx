import type { MiniPlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { VolumeIcon, VolumeMutedIcon } from '#components/icons.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';

// Drives the graph's volume gain, not `element.volume`, which is read-only on iOS
export function VolumeControl({
	className,
	labels,
}: {
	className?: string | undefined;
	labels: Pick<MiniPlayerLabels, 'mute' | 'unmute' | 'volume'>;
}) {
	const volume = usePlayer((state) => state.volume);
	const setVolume = usePlayer((state) => state.setVolume);
	const toggleMute = usePlayer((state) => state.toggleMute);

	const isMuted = volume === 0;

	return (
		<div className={joinClassNames('player-volume', className)}>
			<Button
				aria-label={isMuted ? labels.unmute : labels.mute}
				aria-pressed={isMuted}
				className="player-button-icon"
				onClick={toggleMute}
			>
				{isMuted ? <VolumeMutedIcon /> : <VolumeIcon />}
			</Button>
			<input
				aria-label={labels.volume}
				className="player-volume-slider"
				max={1}
				min={0}
				onChange={(event) => {
					setVolume(Number(event.target.value));
				}}
				step={0.01}
				type="range"
				value={volume}
			/>
		</div>
	);
}
