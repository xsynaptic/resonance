import type { CSSProperties, PointerEvent } from 'react';

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

import type { PlacedCuePoint } from '#waveform/cue-points.ts';
import type { OverviewCues, WaveformRendering } from '#waveform/waveform-render.ts';

import { cuePointAt } from '#waveform/cue-points.ts';
import { getThemeVersion, subscribeTheme } from '#waveform/theme-version.ts';
import { prepareRendering } from '#waveform/waveform-render.ts';

// In CSS pixels: the 0.25rem a pointer can miss a cue point's edge by
const hitMarginPx = 4;

interface HoveredCuePoint {
	placed: PlacedCuePoint;
	ratio: number;
}

interface OverviewInput extends OverviewCues {
	overview: ReadonlyArray<number>;
}

// Handlers hit-test the rendering on screen, and the hovered cue point's label is placed from it
export function useOverviewRendering({ cueDurationSeconds, cuePoints, overview }: OverviewInput) {
	const renderingRef = useRef<undefined | WaveformRendering>(undefined);
	const hoveredRef = useRef<PlacedCuePoint | undefined>(undefined);
	const [hovered, setHovered] = useState<HoveredCuePoint | undefined>(undefined);
	const themeVersion = useSyncExternalStore(subscribeTheme, getThemeVersion, zeroVersion);

	function show(placed: PlacedCuePoint | undefined): void {
		if (placed === hoveredRef.current) return;

		hoveredRef.current = placed;
		setHovered(
			placed === undefined ? undefined : { placed, ratio: renderingRef.current?.ratio ?? 1 },
		);
	}

	// A paint effect depends on it; a resize under a still pointer commits only when a label was showing
	const rebuild = useCallback(
		(canvas: HTMLCanvasElement) => {
			renderingRef.current = prepareRendering(canvas, overview, { cueDurationSeconds, cuePoints });

			if (hoveredRef.current !== undefined) {
				hoveredRef.current = undefined;
				setHovered(undefined);
			}

			return renderingRef.current;
		},
		[cueDurationSeconds, cuePoints, overview],
	);

	return {
		cuePointAt: (event: PointerEvent<HTMLCanvasElement>) =>
			cuePointAtPointer(renderingRef.current, event),
		// Hidden from assistive tech: the tracklist carries the same names and the slider the same seeks
		label:
			hovered === undefined ? undefined : (
				<span
					aria-hidden="true"
					className="player-cue-label"
					data-side={hovered.placed.side}
					style={
						{
							'--player-cue-room': `${String(hovered.placed.room / hovered.ratio)}px`,
							left: hovered.placed.x / hovered.ratio,
							top: hovered.placed.y / hovered.ratio,
						} as CSSProperties
					}
				>
					<span className="player-cue-artist">{hovered.placed.cuePoint.artistLine}</span>
					<span className="player-cue-title">{hovered.placed.cuePoint.title}</span>
				</span>
			),
		onPointerLeave: () => {
			show(undefined);
		},
		onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
			if (event.pointerType === 'touch') return;

			show(cuePointAtPointer(renderingRef.current, event));
		},
		rebuild,
		themeVersion,
	};
}

function cuePointAtPointer(
	rendering: undefined | WaveformRendering,
	event: PointerEvent<HTMLCanvasElement>,
): PlacedCuePoint | undefined {
	if (rendering === undefined || rendering.cuePoints.length === 0) return undefined;

	const rect = event.currentTarget.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return undefined;

	return cuePointAt(
		rendering.cuePoints,
		{
			x: ((event.clientX - rect.left) * rendering.width) / rect.width,
			y: ((event.clientY - rect.top) * rendering.height) / rect.height,
		},
		rendering.cuePointSize / 2 + hitMarginPx * rendering.ratio,
	);
}

function zeroVersion(): number {
	return 0;
}
