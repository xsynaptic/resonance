import type { TrackDetail } from '@xsynaptic/plazmoid-core';

import { formatVersion } from '@xsynaptic/plazmoid-wavedata';

export function knownPeaks(detail: TrackDetail | undefined) {
	const peaks = detail?.peaks;

	return peaks?.formatVersion === formatVersion ? peaks : undefined;
}
