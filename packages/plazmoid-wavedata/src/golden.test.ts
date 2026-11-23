import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

import type { PeaksFacts } from '#descriptor.ts';

import {
	bandsHeaderBytes,
	buildBands,
	buildPeaks,
	describeWavedata,
	framesByteRange,
	pairsByteRange,
	parseBandsHeader,
	parsePeaksHeader,
	peaksHeaderBytes,
	splitPairs,
	validateWavedata,
} from '#index.ts';

interface Golden {
	facts: PeaksFacts;
	fields: Array<[min: number, max: number, rms: number]>;
	levels: Array<[low: number, mid: number, high: number]>;
	sampleRate: number;
}

const fixtures = new URL('../fixtures/v1/', import.meta.url);

async function readFixtures() {
	const [golden, peaks, bands] = await Promise.all([
		readFile(new URL('golden.json', fixtures), 'utf8'),
		readFile(new URL('peaks.bin', fixtures)),
		readFile(new URL('bands.bin', fixtures)),
	]);

	return { bands, golden: JSON.parse(golden) as Golden, peaks };
}

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const peaksHeaderHex = '0100000044ac0000000100000a0000000300000001000000';
const bandsHeaderHex =
	'01000000' +
	'44ac0000' +
	'00040000' +
	'03000000' +
	'03000000' +
	'c8000000' +
	'd0070000' +
	'01000000' +
	'3c000000';

test('both committed headers are the bytes the written format lays out', async () => {
	const { bands, peaks } = await readFixtures();

	expect(toHex(peaks.subarray(0, peaksHeaderBytes))).toBe(peaksHeaderHex);
	expect(toHex(bands.subarray(0, bandsHeaderBytes))).toBe(bandsHeaderHex);
	expect(peaks).toHaveLength(54);
	expect(bands).toHaveLength(45);
});

test('the builders give the committed files from the expected fields and levels', async () => {
	const { bands, golden, peaks } = await readFixtures();

	const builtPeaks = buildPeaks(Int8Array.from(golden.fields.flat()), golden.sampleRate);
	const builtBands = buildBands(Uint8Array.from(golden.levels.flat()), golden.sampleRate);

	expect(toHex(builtPeaks)).toBe(toHex(peaks));
	expect(toHex(builtBands)).toBe(toHex(bands));
});

test('the parsers and the slice helpers read the committed files back to the expected values', async () => {
	const { bands, golden, peaks } = await readFixtures();
	const { facts } = golden;

	expect(parsePeaksHeader(peaks)).toStrictEqual({ pairCount: 10, sampleRate: golden.sampleRate });
	expect(parseBandsHeader(bands)).toStrictEqual({ frameCount: 3, sampleRate: golden.sampleRate });

	const pairs = pairsByteRange(facts, 0, facts.pairCount);
	const target = { rms: new Int8Array(10), samples: new Int8Array(20) };

	expect(pairs).toStrictEqual([24, 54]);
	splitPairs(peaks.subarray(...(pairs ?? [0, 0])), target, 0);

	expect([...target.samples]).toStrictEqual(golden.fields.flatMap(([min, max]) => [min, max]));
	expect([...target.rms]).toStrictEqual(golden.fields.map((pair) => pair[2]));

	const frames = facts.bands && framesByteRange(facts.bands, 0, facts.bands.frameCount);

	expect(frames).toStrictEqual([36, 45]);
	expect([...bands.subarray(...(frames ?? [0, 0]))]).toStrictEqual(golden.levels.flat());
});

test('the committed files describe to the expected facts and validate clean', async () => {
	const { bands, golden, peaks } = await readFixtures();

	const { bands: _bandsFacts, ...peaksFacts } = golden.facts;

	expect(describeWavedata({ bands, peaks })).toStrictEqual(golden.facts);
	expect(describeWavedata({ peaks })).toStrictEqual(peaksFacts);
	expect(validateWavedata({ bands, peaks })).toStrictEqual([]);
	expect(validateWavedata({ peaks })).toStrictEqual([]);
});
