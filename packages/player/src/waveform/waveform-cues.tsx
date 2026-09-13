import type { CSSProperties } from 'react';

import { useEffect, useRef, useState } from 'react';

import type { QueueCuePoint } from '#types.ts';
import type { CueGrid } from '#waveform/cue-dots.ts';

import { layoutCueDots } from '#waveform/cue-dots.ts';
import { measureBarGrid } from '#waveform/waveform-render.ts';

interface WaveformCuesProps {
	cuePoints: ReadonlyArray<QueueCuePoint>;
	durationSeconds: number | undefined;
	// Unset leaves the dots inert, as the preview's waveform is
	onSeek?: ((seconds: number) => void) | undefined;
}

// Hidden from assistive tech: the tracklist carries the same names and the slider the same seeks
export function WaveformCues({ cuePoints, durationSeconds, onSeek }: WaveformCuesProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [grid, setGrid] = useState<CueGrid | undefined>(undefined);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		// Observing measures once on its own, which is the first layout
		const observer = new ResizeObserver(() => {
			const measured = toCueGrid(root);

			setGrid((current) => (isSameGrid(current, measured) ? current : measured));
		});

		observer.observe(root);

		return () => {
			observer.disconnect();
		};
	}, []);

	const dots =
		grid === undefined || durationSeconds === undefined || durationSeconds <= 0
			? []
			: layoutCueDots(cuePoints, durationSeconds, grid);

	return (
		<div aria-hidden="true" className="player-cues" ref={rootRef}>
			{dots.map(({ cue, lane, left, room, side }) => (
				<span
					className="player-cue"
					data-side={side}
					key={cue.startSeconds}
					onClick={
						onSeek === undefined
							? undefined
							: () => {
									onSeek(cue.startSeconds);
								}
					}
					// Custom properties are not in `CSSProperties`
					style={
						{
							'--player-cue-lane': lane,
							'--player-cue-room': `${String(room)}px`,
							left,
						} as CSSProperties
					}
				>
					<span className="player-cue-label">
						<span className="player-cue-artist">{cue.artistLine}</span>
						<span className="player-cue-title">{cue.title}</span>
					</span>
				</span>
			))}
		</div>
	);
}

function isSameGrid(current: CueGrid | undefined, next: CueGrid): boolean {
	return (
		current?.count === next.count && current.pitch === next.pitch && current.width === next.width
	);
}

// The renderer measures in device pixels and the DOM positions in CSS pixels
function toCueGrid(element: HTMLElement): CueGrid {
	const { bar, count, pitch, ratio, width } = measureBarGrid(element);

	return { bar: bar / ratio, count, pitch: pitch / ratio, width: width / ratio };
}
