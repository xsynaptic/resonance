import type { QueueItem, QueueLoudness } from '#types.ts';

// Provisional until a corpus measurement sets it from the real catalogue
const playbackTargetLufs = -16;

// dBTP headroom the gain is clamped against, so normalization can never introduce clipping
const playbackTruePeakCeilingDbtp = -1;

// Album values in natural order preserve a release's dynamics; per-track under shuffle equalizes mixed sources
export function normalizationGain(item: QueueItem, isShuffling: boolean): number {
	return playbackGain(isShuffling ? item.loudness : item.albumLoudness);
}

export function playbackGain({ integratedLufs, truePeakDbtp }: QueueLoudness): number {
	if (integratedLufs === undefined || truePeakDbtp === undefined) return 1;

	const appliedDb = Math.min(
		playbackTargetLufs - integratedLufs,
		playbackTruePeakCeilingDbtp - truePeakDbtp,
	);

	return 10 ** (appliedDb / 20);
}
