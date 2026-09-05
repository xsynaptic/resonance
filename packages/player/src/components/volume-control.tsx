import { useRef, useState, useSyncExternalStore } from 'react';

import type { MiniPlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { VolumeIcon, VolumeLowIcon, VolumeMutedIcon } from '#components/icons.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';

const hoverQuery = '(hover: hover)';
const lowVolume = 0.5;

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
	const isHoverCapable = useIsHoverCapable();
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const isMuted = volume === 0;
	const muteLabel = isMuted ? labels.unmute : labels.mute;

	return (
		<div
			className={joinClassNames('player-volume', className)}
			data-open={isOpen ? '' : undefined}
			onKeyDown={(event) => {
				if (event.key !== 'Escape') return;

				setIsOpen(false);
				triggerRef.current?.focus();
			}}
		>
			<Button
				aria-expanded={isHoverCapable ? undefined : isOpen}
				aria-label={isHoverCapable ? muteLabel : labels.volume}
				aria-pressed={isHoverCapable ? isMuted : undefined}
				className="player-button-icon"
				onClick={() => {
					if (isHoverCapable) {
						toggleMute();
						return;
					}

					setIsOpen((open) => !open);
				}}
				ref={triggerRef}
			>
				<LevelIcon volume={volume} />
			</Button>
			<div className="player-volume-panel">
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
				{isHoverCapable ? undefined : (
					<Button
						aria-label={muteLabel}
						aria-pressed={isMuted}
						className="player-button-icon"
						onClick={toggleMute}
					>
						{isMuted ? <VolumeMutedIcon /> : <VolumeIcon />}
					</Button>
				)}
			</div>
		</div>
	);
}

function canHover(): boolean {
	return matchMedia(hoverQuery).matches;
}

function LevelIcon({ volume }: { volume: number }) {
	if (volume === 0) return <VolumeMutedIcon />;
	if (volume < lowVolume) return <VolumeLowIcon />;

	return <VolumeIcon />;
}

function subscribeHover(onChange: () => void): () => void {
	const query = matchMedia(hoverQuery);

	query.addEventListener('change', onChange);

	return () => {
		query.removeEventListener('change', onChange);
	};
}

// Decides what the trigger's click does: mute where the panel already opens on hover, open it where it cannot
function useIsHoverCapable(): boolean {
	return useSyncExternalStore(subscribeHover, canHover, () => false);
}
