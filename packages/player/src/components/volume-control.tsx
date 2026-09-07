import type { CSSProperties } from 'react';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { VolumeIcon, VolumeLowIcon, VolumeMutedIcon } from '#components/icons.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

const hoverQuery = '(hover: hover)';
const lowVolume = 0.5;

// Drives the graph's volume gain, not `element.volume`, which is read-only on iOS
export function VolumeControl({
	className,
	labels,
}: {
	className?: string | undefined;
	labels: Pick<PlayerLabels, 'mute' | 'unmute' | 'volume'>;
}) {
	const volume = usePlayer((state) => state.volume);
	const store = usePlayerStoreApi();
	const isHoverCapable = useIsHoverCapable();
	const [isOpen, setIsOpen] = useState(false);
	const controlRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	// Only the touch branch opens the panel, so this listener is mounted only where a tap can leave it open
	useEffect(() => {
		if (!isOpen) return;

		const onPointerDown = (event: PointerEvent): void => {
			if (event.target instanceof Node && controlRef.current?.contains(event.target)) return;

			setIsOpen(false);
		};

		// Nothing here calls `preventDefault`, so the browser need not wait on it to start a scroll
		document.addEventListener('pointerdown', onPointerDown, { passive: true });

		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
		};
	}, [isOpen]);

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
			ref={controlRef}
		>
			<Button
				aria-expanded={isHoverCapable ? undefined : isOpen}
				aria-label={isHoverCapable ? muteLabel : labels.volume}
				aria-pressed={isHoverCapable ? isMuted : undefined}
				className="player-button-icon"
				onClick={() => {
					if (isHoverCapable) {
						store.getState().toggleMute();
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
						aria-pressed={isMuted}
						className="player-button-icon"
						onClick={() => {
							store.getState().toggleMute();
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

function levelStyle(volume: number): CSSProperties {
	return { '--player-volume-level': `${String(volume * 100)}%` };
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
