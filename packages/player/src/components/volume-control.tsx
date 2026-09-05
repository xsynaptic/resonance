import { VolumeIcon } from '#components/icons.tsx';
import { usePlayer } from '#store/context.tsx';

// Drives the graph's volume gain, not `element.volume`, which is read-only on iOS
export function VolumeControl({ label }: { label: string }) {
	const volume = usePlayer((state) => state.volume);
	const setVolume = usePlayer((state) => state.setVolume);

	return (
		<div className="player-volume">
			<VolumeIcon />
			<input
				aria-label={label}
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
