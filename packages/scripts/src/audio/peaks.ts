import {
	peaksFieldCount,
	peaksFullScale,
	peaksHeaderBytes,
	samplesPerPair,
} from '@xsynaptic/shared/waveform-format';

import { collectHashedOutputs } from '#audio/hashed-outputs.ts';
import { assertHeaderFields } from '#audio/header-fields.ts';
import { readFileHead } from '#shared/utils.ts';

export const peaksRole = 'peaks';

const peaksPattern = /^(?<base>.+)\.peaks\.[0-9a-f]{12}\.bin$/;

const peaksVersion = 1;
const minMaxRmsKind = 1;

export interface PeaksHeader {
	pairCount: number;
	sampleRate: number;
}

export interface PairAccumulator {
	add: (sample: number) => void;
	finish: () => Buffer;
}

export function buildPeaks(fields: Buffer, sampleRate: number): Buffer {
	const header = Buffer.alloc(peaksHeaderBytes);

	header.writeUInt32LE(peaksVersion, 0);
	header.writeUInt32LE(sampleRate, 4);
	header.writeUInt32LE(samplesPerPair, 8);
	header.writeUInt32LE(fields.length / peaksFieldCount, 12);
	header.writeUInt32LE(peaksFieldCount, 16);
	header.writeUInt32LE(minMaxRmsKind, 20);

	return Buffer.concat([header, fields]);
}

// Exported for the manifest step, which has to name the file the panel will range-request
export async function collectPeaks(cacheDir: string): Promise<Map<string, string>> {
	return collectHashedOutputs(cacheDir, peaksPattern, 'peak files');
}

export function createPairAccumulator(): PairAccumulator {
	const fields: Array<number> = [];
	let min = 0;
	let max = 0;
	let sumOfSquares = 0;
	let samplesInPair = 0;

	const closePair = (): void => {
		fields.push(
			encodeAmplitude(min),
			encodeAmplitude(max),
			encodeAmplitude(Math.sqrt(sumOfSquares / samplesInPair)),
		);
		sumOfSquares = 0;
		samplesInPair = 0;
	};

	return {
		add: (sample) => {
			if (samplesInPair === 0 || sample < min) min = sample;
			if (samplesInPair === 0 || sample > max) max = sample;

			sumOfSquares += sample * sample;
			samplesInPair += 1;
			if (samplesInPair === samplesPerPair) closePair();
		},
		finish: () => {
			if (samplesInPair > 0) closePair();

			const values = Int8Array.from(fields);

			return Buffer.from(values.buffer, values.byteOffset, values.byteLength);
		},
	};
}

export function parsePeaksHeader(buffer: Buffer): PeaksHeader {
	if (buffer.length < peaksHeaderBytes) throw new Error('Peaks are shorter than their header');

	assertHeaderFields(buffer, 'Peaks', [
		['version', 0, peaksVersion],
		['samples per pair', 8, samplesPerPair],
		['field count', 16, peaksFieldCount],
		['value kind', 20, minMaxRmsKind],
	]);

	return { pairCount: buffer.readUInt32LE(12), sampleRate: buffer.readUInt32LE(4) };
}

export async function readPeaksHeader(file: string): Promise<PeaksHeader> {
	return parsePeaksHeader(await readFileHead(file, peaksHeaderBytes));
}

// Truncation keeps RMS at or under the larger peak
function encodeAmplitude(value: number): number {
	return Math.min(
		peaksFullScale - 1,
		Math.max(-peaksFullScale, Math.trunc(value * peaksFullScale)),
	);
}
