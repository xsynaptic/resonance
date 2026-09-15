import type { CSSProperties } from 'react';

import { useRef, useState, useSyncExternalStore } from 'react';

import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { VolumeIcon, VolumeLowIcon, VolumeMutedIcon } from '#components/icons.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { useDismiss } from '#lib/use-dismiss.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';
import { audibleVolume } from '#store/selectors.ts';

const hoverQuery = '(hover: hover)';
const lowVolume = 0.5;

interface LevelStyle extends CSSProperties {
	'--player-volume-level': string;
}

// Drives the graph's volume gain, not `element.volume`, which is read-only on iOS
export function VolumeControl({
	className,
	labels,
}: {
	className?: string | undefined;
	labels: Pick<PlayerLabels, 'mute' | 'unmute' | 'volume'>;
}) {
	const volume = usePlayer(audibleVolume);
	const store = usePlayerStoreApi();
	const isHoverCapable = useIsHoverCapable();
	const { controlRef, isOpen, onKeyDown, setIsOpen, triggerRef } = useDismissablePanel();

	const isMuted = volume === 0;
	const muteLabel = isMuted ? labels.unmute : labels.mute;

	return (
		<div
			className={joinClassNames('player-volume', className)}
			data-open={isOpen ? '' : undefined}
			onKeyDown={onKeyDown}
			ref={controlRef}
		>
			<Button
				aria-expanded={isHoverCapable ? undefined : isOpen}
				aria-label={isHoverCapable ? muteLabel : labels.volume}
				className="player-button-icon"
				onClick={() => {
					if (isHoverCapable) {
						store.getState().toggleMuted();
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
					aria-valuetext={`${String(Math.round(volume * 100))}%`}
					className="player-volume-slider"
					max={1}
					min={0}
					onChange={(event) => {
						store.getState().setVolume(Number(event.target.value));
					}}
					step={0.01}
					style={levelStyle(volume)}
					type="range"
					value={volume}
				/>
				{isHoverCapable ? undefined : (
					<Button
						aria-label={muteLabel}
						className="player-button-icon"
						onClick={() => {
							store.getState().toggleMuted();
						}}
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

function levelStyle(volume: number): LevelStyle {
	return { '--player-volume-level': `${String(volume * 100)}%` };
}

function subscribeHover(onChange: () => void): () => void {
	const query = matchMedia(hoverQuery);

	query.addEventListener('change', onChange);

	return () => {
		query.removeEventListener('change', onChange);
	};
}

function useDismissablePanel() {
	const [isOpen, setIsOpen] = useState(false);
	const controlRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	// Only the touch branch opens the panel, so the outside press listener mounts only where a tap can leave it open
	const onKeyDown = useDismiss({
		containerRef: controlRef,
		isOpen,
		onDismiss: () => {
			setIsOpen(false);
		},
		triggerRef,
	});

	return { controlRef, isOpen, onKeyDown, setIsOpen, triggerRef };
}

// Decides what the trigger's click does: mute where the panel already opens on hover, open it where it cannot
function useIsHoverCapable(): boolean {
	return useSyncExternalStore(subscribeHover, canHover, () => false);
}
