import type { WaveMarker } from '@xsynaptic/sonic-ui';

import type { QueueCuePoint } from '#types.ts';

function cueLabel({ artistLine, title }: QueueCuePoint): string {
	return artistLine === '' ? title : `${artistLine} - ${title}`;
}

// Past the last timestamp of a tracklist carrying more tracks than timestamps, the label is a guess
export function toPanelMarkers(
	cuePoints: ReadonlyArray<QueueCuePoint>,
	trackCount: number,
	partialNote: string,
): Array<WaveMarker> {
	return cuePoints.map((cuePoint, index) => {
		const { artistLine: artist, startSeconds: start, title } = cuePoint;
		const label = cueLabel(cuePoint);

		if (index < cuePoints.length - 1 || trackCount <= cuePoints.length) {
			return { artist, label, start, title };
		}

		return {
			artist,
			dimmed: true,
			label: `${label} (${partialNote})`,
			start,
			title: `${title} (${partialNote})`,
		};
	});
}

export function toStripMarkers(cuePoints: ReadonlyArray<QueueCuePoint>): Array<WaveMarker> {
	return cuePoints.map((cuePoint) => ({ label: cueLabel(cuePoint), start: cuePoint.startSeconds }));
}
