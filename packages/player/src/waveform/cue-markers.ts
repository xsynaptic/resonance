import type { WaveMarker } from '@xsynaptic/sonic-ui';

import type { QueueCuePoint } from '#types.ts';

import { formatClock } from '#lib/format.ts';
import { cueIndexAt } from '#waveform/cue-points.ts';

function cueLabel({ artistLine, title }: QueueCuePoint): string {
	return artistLine === '' ? title : `${artistLine} - ${title}`;
}

export function describePosition(cuePoints: ReadonlyArray<QueueCuePoint>, seconds: number): string {
	const covering = cuePoints[cueIndexAt(cuePoints, seconds)];

	return covering ? `${formatClock(seconds)} ${cueLabel(covering)}` : formatClock(seconds);
}

// Past the last timestamp of a tracklist carrying more tracks than timestamps, the label is a guess
export function toPanelMarkers(
	cuePoints: ReadonlyArray<QueueCuePoint>,
	trackCount: number,
	partialNote: string,
): Array<WaveMarker> {
	return cuePoints.map((cuePoint, index) => {
		const label = cueLabel(cuePoint);

		if (index < cuePoints.length - 1 || trackCount <= cuePoints.length) {
			return { label, start: cuePoint.startSeconds };
		}

		return { dimmed: true, label: `${label} (${partialNote})`, start: cuePoint.startSeconds };
	});
}

export function toStripMarkers(cuePoints: ReadonlyArray<QueueCuePoint>): Array<WaveMarker> {
	return cuePoints.map((cuePoint) => ({ label: cueLabel(cuePoint), start: cuePoint.startSeconds }));
}
