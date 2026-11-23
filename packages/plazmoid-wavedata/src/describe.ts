import type { BandsFacts, PeaksFacts } from '#descriptor.ts';

import { parseBandsHeader, parsePeaksHeader, toSigned } from '#files.ts';
import {
	bandCount,
	bandsDecibelRange,
	bandsHeaderBytes,
	formatVersion,
	peaksFieldCount,
	peaksFullScale,
	peaksHeaderBytes,
	samplesPerFrame,
	samplesPerPair,
} from '#format.ts';

const rangeFloor = peaksFullScale * 10 ** (-60 / 20);
const quietShare = 0.1;
const loudShare = 0.95;
const medianShare = 0.5;

const rmsField = 2;

export function describeWavedata(files: {
	bands: Uint8Array;
	peaks: Uint8Array;
}): PeaksFacts & { bands: BandsFacts };
export function describeWavedata(files: { bands?: Uint8Array; peaks: Uint8Array }): PeaksFacts;
export function describeWavedata({
	bands,
	peaks,
}: {
	bands?: Uint8Array;
	peaks: Uint8Array;
}): PeaksFacts {
	const { pairCount, sampleRate } = parsePeaksHeader(peaks);
	const fields = toSigned(peaks.subarray(peaksHeaderBytes));
	if (fields.length < pairCount * peaksFieldCount) throw new Error('Peaks are truncated');

	const facts: PeaksFacts = {
		byteOffset: peaksHeaderBytes,
		formatVersion,
		pairCount,
		pairsPerSecond: sampleRate / samplesPerPair,
		rmsRange: levelRange(fields, pairCount),
	};

	return bands === undefined ? facts : { ...facts, bands: describeBands(bands) };
}

function describeBands(bands: Uint8Array): BandsFacts {
	const { frameCount, sampleRate } = parseBandsHeader(bands);
	const levels = bands.subarray(bandsHeaderBytes);
	if (levels.length < frameCount * bandCount) throw new Error('Band data is truncated');

	const medians: Array<number> = [];

	for (let band = 0; band < bandCount; band += 1) {
		const counts = new Uint32Array(256);

		for (let frame = 0; frame < frameCount; frame += 1) {
			const level = levels[frame * bandCount + band] ?? 0;

			counts[level] = (counts[level] ?? 0) + 1;
		}

		medians.push(levelAtShare(counts, medianShare, 1));
	}

	return {
		bandCount,
		byteOffset: bandsHeaderBytes,
		frameCount,
		framesPerSecond: sampleRate / samplesPerFrame,
		medians,
		minDecibels: -bandsDecibelRange,
	};
}

function levelRange(fields: Int8Array, pairCount: number): [quiet: number, loud: number] {
	const counts = new Uint32Array(peaksFullScale);

	for (let pair = 0; pair < pairCount; pair += 1) {
		const rms = fields[pair * peaksFieldCount + rmsField] ?? 0;

		if (rms > rangeFloor) counts[rms] = (counts[rms] ?? 0) + 1;
	}

	return [levelAtShare(counts, quietShare, 0), levelAtShare(counts, loudShare, 0)];
}

function levelAtShare(counts: Uint32Array, share: number, lowest: number): number {
	let total = 0;

	for (let level = lowest; level < counts.length; level += 1) total += counts[level] ?? 0;

	const rank = Math.max(1, Math.ceil(share * total));
	let seen = 0;

	for (let level = lowest; level < counts.length; level += 1) {
		seen += counts[level] ?? 0;
		if (total > 0 && seen >= rank) return level;
	}

	return 0;
}
