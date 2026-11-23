import {
	bandsDecibelRange,
	bandsHeaderBytes,
	parseBandsHeader,
	samplesPerFrame,
} from '@xsynaptic/plazmoid-wavedata';

import { collectHashedOutputs } from '#audio/hashed-outputs.ts';
import { readFileHead } from '#shared/utils.ts';

export const bandsRole = 'bands';

const bandsPattern = /^(?<base>.+)\.bands\.[0-9a-f]{12}\.bin$/;

export interface BandAccumulator {
	add: (low: number, mid: number, high: number) => void;
	finish: () => Buffer;
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

export async function readBandsHeader(file: string) {
	return parseBandsHeader(await readFileHead(file, bandsHeaderBytes));
}

// sonic-ui reads a frame of three zeros as not loaded, so 0 is kept for digital silence
function encodeBandLevel(meanSquare: number): number {
	if (meanSquare === 0) return 0;

	const decibels = 10 * Math.log10(meanSquare);
	const level = Math.round(255 * (1 + decibels / bandsDecibelRange));

	return Math.min(255, Math.max(1, level));
}
