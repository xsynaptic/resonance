import { inspectBandsHeader, inspectPeaksHeader, toSigned } from '#files.ts';
import {
	bandCount,
	bandsHeaderBytes,
	peaksFieldCount,
	peaksHeaderBytes,
	samplesPerFrame,
	samplesPerPair,
} from '#format.ts';

interface FileShape {
	cellBytes: number;
	cellNoun: string;
	headerBytes: number;
	inspect: typeof inspectPeaksHeader;
	label: string;
}

interface PairFault {
	count: number;
	first: number;
	rule: string;
}

const peaksShape: FileShape = {
	cellBytes: peaksFieldCount,
	cellNoun: 'pair',
	headerBytes: peaksHeaderBytes,
	inspect: inspectPeaksHeader,
	label: 'Peaks',
};

const bandsShape: FileShape = {
	cellBytes: bandCount,
	cellNoun: 'frame',
	headerBytes: bandsHeaderBytes,
	inspect: inspectBandsHeader,
	label: 'Band data',
};

const pairsPerFrame = samplesPerFrame / samplesPerPair;

export function validateWavedata({ bands, peaks }: { bands?: Uint8Array; peaks: Uint8Array }) {
	const { header: peaksHeader, problems } = checkFile(peaks, peaksShape);

	if (peaksHeader) problems.push(...pairProblems(peaks, peaksHeader.count));
	if (bands === undefined) return problems;

	const { header: bandsHeader, problems: bandsProblems } = checkFile(bands, bandsShape);

	problems.push(...bandsProblems);

	if (!peaksHeader || !bandsHeader) return problems;

	if (peaksHeader.sampleRate !== bandsHeader.sampleRate) {
		problems.push(
			`Peaks sample rate is ${String(peaksHeader.sampleRate)}, band data sample rate is ${String(bandsHeader.sampleRate)}`,
		);
	}

	const frames = Math.ceil(peaksHeader.count / pairsPerFrame);

	if (bandsHeader.count !== frames) {
		problems.push(
			`Band data frame count is ${String(bandsHeader.count)}, expected ${String(frames)} for ${String(peaksHeader.count)} pairs`,
		);
	}

	return problems;
}

function checkFile(bytes: Uint8Array, shape: FileShape) {
	const { cellBytes, cellNoun, headerBytes, label } = shape;
	const { count, problems, sampleRate } = shape.inspect(bytes);

	if (count === undefined || sampleRate === undefined) return { header: undefined, problems };

	if (sampleRate === 0) problems.push(`${label} sample rate is 0`);
	if (count === 0) problems.push(`${label} ${cellNoun} count is 0`);

	const expected = headerBytes + count * cellBytes;

	if (bytes.length !== expected) {
		problems.push(
			`${label} length is ${String(bytes.length)} bytes, expected ${String(expected)} for ${String(count)} ${cellNoun}s`,
		);
	}

	return { header: { count, sampleRate }, problems };
}

function pairProblems(peaks: Uint8Array, pairCount: number): Array<string> {
	const fields = toSigned(peaks.subarray(peaksHeaderBytes));
	const pairs = Math.min(pairCount, Math.floor(fields.length / peaksFieldCount));
	const faults: Array<PairFault> = [
		{ count: 0, first: 0, rule: 'min above max' },
		{ count: 0, first: 0, rule: 'RMS below zero' },
		{ count: 0, first: 0, rule: 'RMS above the larger peak' },
	];

	for (let pair = 0; pair < pairs; pair += 1) {
		const at = pair * peaksFieldCount;
		const min = fields[at] ?? 0;
		const max = fields[at + 1] ?? 0;
		const rms = fields[at + 2] ?? 0;
		const broken = [min > max, rms < 0, rms > Math.max(Math.abs(min), Math.abs(max))];

		for (const [index, fault] of faults.entries()) {
			if (broken[index] !== true) continue;
			if (fault.count === 0) fault.first = pair;

			fault.count += 1;
		}
	}

	return faults
		.filter((fault) => fault.count > 0)
		.map(
			(fault) =>
				`Peaks have ${fault.rule} in ${String(fault.count)} pairs, the first at pair ${String(fault.first)}`,
		);
}
