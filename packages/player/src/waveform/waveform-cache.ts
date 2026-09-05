import WaveformData from 'waveform-data';

import type { PlayerUrls } from '#types.ts';

const cache = new Map<string, ReadonlyArray<number>>();

// `undefined` on any failure keeps the caller on its inline overview
// The host answers with a URL rather than bytes: a redirect would taint the origin and no CORS rule could match it
export async function loadWaveform(
	resolveWaveform: PlayerUrls['waveform'],
	trackId: string,
	bucketCount: number,
	signal?: AbortSignal,
): Promise<ReadonlyArray<number> | undefined> {
	const key = `${trackId}:${String(bucketCount)}`;
	const cached = cache.get(key);
	if (cached) return cached;

	try {
		const url = await resolveWaveform(trackId);
		if (url === undefined) return undefined;

		const response = await fetch(url, signal ? { signal } : {});
		if (!response.ok) return undefined;

		const peaks = resamplePeaks(WaveformData.create(await response.arrayBuffer()), bucketCount);

		cache.set(key, peaks);

		return peaks;
	} catch {
		return undefined;
	}
}

// Each bucket is the max absolute peak across its span, normalized by full scale
export function resamplePeaks(waveform: WaveformData, bucketCount: number): Array<number> {
	const channel = waveform.channel(0);
	const { length } = waveform;
	const fullScale = 2 ** (waveform.bits - 1);
	const peaks: Array<number> = [];

	for (let bucket = 0; bucket < bucketCount; bucket += 1) {
		const start = Math.floor((bucket * length) / bucketCount);
		const end = Math.max(start + 1, Math.floor(((bucket + 1) * length) / bucketCount));
		let peak = 0;

		for (let pixel = start; pixel < end && pixel < length; pixel += 1) {
			const amplitude = Math.max(
				Math.abs(channel.min_sample(pixel)),
				Math.abs(channel.max_sample(pixel)),
			);
			if (amplitude > peak) peak = amplitude;
		}

		peaks.push(Math.min(1, peak / fullScale));
	}

	return peaks;
}
