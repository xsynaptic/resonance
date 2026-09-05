import type WaveformData from 'waveform-data';

import type { PlayerUrls } from '#types.ts';

const cacheLimit = 64;

const cache = new Map<string, ReadonlyArray<number>>();

const inFlight = new Map<string, Promise<ReadonlyArray<number> | undefined>>();

export function bucketPeaks(waveform: WaveformData, bucketCount: number): Array<number> {
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

// `undefined` on any failure keeps the caller on its inline overview
// The host answers with a URL rather than bytes: a redirect would taint the origin and no CORS rule could match it
export function loadWaveform(
	resolveWaveform: PlayerUrls['waveform'],
	trackId: string,
	bucketCount: number,
): Promise<ReadonlyArray<number> | undefined> {
	const key = `${trackId}:${String(bucketCount)}`;
	const cached = cache.get(key);
	if (cached) return Promise.resolve(cached);

	const pending = inFlight.get(key);
	if (pending) return pending;

	const request = fetchPeaks(resolveWaveform, trackId, bucketCount, key);

	inFlight.set(key, request);

	return request;
}

async function fetchPeaks(
	resolveWaveform: PlayerUrls['waveform'],
	trackId: string,
	bucketCount: number,
	key: string,
): Promise<ReadonlyArray<number> | undefined> {
	try {
		const url = await resolveWaveform(trackId);
		if (url === undefined) return undefined;

		const response = await fetch(url);
		if (!response.ok) return undefined;

		// Loaded here rather than imported: a host that answers `undefined` never pays for the decoder
		const { default: waveformData } = await import('waveform-data');

		const peaks = bucketPeaks(waveformData.create(await response.arrayBuffer()), bucketCount);

		remember(key, peaks);

		return peaks;
	} catch {
		return undefined;
	} finally {
		inFlight.delete(key);
	}
}

function remember(key: string, peaks: ReadonlyArray<number>): void {
	if (cache.size >= cacheLimit) {
		const oldest = cache.keys().next().value;

		if (oldest !== undefined) cache.delete(oldest);
	}

	cache.set(key, peaks);
}
