import {
	bandCount,
	bandsDecibelRange,
	bandsHeaderBytes,
	samplesPerFrame,
} from '@xsynaptic/shared/waveform-format';

import { collectHashedOutputs } from '#audio/hashed-outputs.ts';
import { assertHeaderFields } from '#audio/header-fields.ts';
import { readFileHead } from '#shared/utils.ts';

export const bandsRole = 'bands';

const bandsPattern = /^(?<base>.+)\.bands\.[0-9a-f]{12}\.bin$/;

const bandsVersion = 1;
const rmsDecibelsKind = 1;

export const bandEdges = [200, 2000] as const;

export interface BandAccumulator {
	add: (low: number, mid: number, high: number) => void;
	finish: () => Buffer;
}

export interface BandsHeader {
	frameCount: number;
	sampleRate: number;
}

export function buildBands(levels: Buffer, sampleRate: number): Buffer {
	const header = Buffer.alloc(bandsHeaderBytes);

	header.writeInt32LE(bandsVersion, 0);
	header.writeInt32LE(sampleRate, 4);
	header.writeInt32LE(samplesPerFrame, 8);
	header.writeUInt32LE(levels.length / bandCount, 12);
	header.writeUInt32LE(bandCount, 16);
	header.writeUInt32LE(bandEdges[0], 20);
	header.writeUInt32LE(bandEdges[1], 24);
	header.writeUInt32LE(rmsDecibelsKind, 28);
	header.writeUInt32LE(bandsDecibelRange, 32);

	return Buffer.concat([header, levels]);
}

export async function collectBands(cacheDir: string): Promise<Map<string, string>> {
	return collectHashedOutputs(cacheDir, bandsPattern, 'band files');
}

export function createBandAccumulator(): BandAccumulator {
	const levels: Array<number> = [];
	let lowSquares = 0;
	let midSquares = 0;
	let highSquares = 0;
	let samplesInFrame = 0;

	const closeFrame = (): void => {
		levels.push(
			encodeBandLevel(lowSquares / samplesInFrame),
			encodeBandLevel(midSquares / samplesInFrame),
			encodeBandLevel(highSquares / samplesInFrame),
		);
		lowSquares = 0;
		midSquares = 0;
		highSquares = 0;
		samplesInFrame = 0;
	};

	return {
		add: (low, mid, high) => {
			lowSquares += low * low;
			midSquares += mid * mid;
			highSquares += high * high;
			samplesInFrame += 1;
			if (samplesInFrame === samplesPerFrame) closeFrame();
		},
		finish: () => {
			if (samplesInFrame > 0) closeFrame();
			return Buffer.from(levels);
		},
	};
}

export function parseBandsHeader(buffer: Buffer): BandsHeader {
	if (buffer.length < bandsHeaderBytes) throw new Error('Band data is shorter than its header');

	assertHeaderFields(buffer, 'Band data', [
		['version', 0, bandsVersion],
		['samples per frame', 8, samplesPerFrame],
		['band count', 16, bandCount],
		['first band edge', 20, bandEdges[0]],
		['second band edge', 24, bandEdges[1]],
		['value kind', 28, rmsDecibelsKind],
		['decibel range', 32, bandsDecibelRange],
	]);

	return { frameCount: buffer.readUInt32LE(12), sampleRate: buffer.readInt32LE(4) };
}

export async function readBandsHeader(file: string): Promise<BandsHeader> {
	return parseBandsHeader(await readFileHead(file, bandsHeaderBytes));
}

export function bandMedians(buffer: Buffer): Array<number> {
	const { frameCount } = parseBandsHeader(buffer);
	const levels = buffer.subarray(bandsHeaderBytes);
	if (levels.length < frameCount * bandCount) throw new Error('Band data is truncated');

	const medians: Array<number> = [];

	for (let band = 0; band < bandCount; band += 1) {
		const counts = new Uint32Array(256);

		for (let frame = 0; frame < frameCount; frame += 1) {
			const level = levels[frame * bandCount + band] ?? 0;

			counts[level] = (counts[level] ?? 0) + 1;
		}

		medians.push(medianLevel(counts));
	}

	return medians;
}

// Silent frames are left out, as a long silence would drag the median to the floor
function medianLevel(counts: Uint32Array): number {
	let total = 0;

	for (let level = 1; level < 256; level += 1) total += counts[level] ?? 0;

	let seen = 0;

	for (let level = 1; level < 256; level += 1) {
		seen += counts[level] ?? 0;
		if (seen * 2 >= total) return level;
	}

	return 0;
}

// sonic-ui reads a frame of three zeros as not loaded, so 0 is kept for digital silence
function encodeBandLevel(meanSquare: number): number {
	if (meanSquare === 0) return 0;

	const decibels = 10 * Math.log10(meanSquare);
	const level = Math.round(255 * (1 + decibels / bandsDecibelRange));

	return Math.min(255, Math.max(1, level));
}
