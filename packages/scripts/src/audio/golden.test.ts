import { buildBands, buildPeaks } from '@xsynaptic/plazmoid-wavedata';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test } from 'vitest';

import { createAnalysisReducer } from '#audio/analysis.ts';

interface Run {
	samples: number;
	value: number;
}

interface Golden {
	input: { high: Array<Run>; low: Array<Run>; mid: Array<Run>; mono: Array<Run> };
	sampleCount: number;
	sampleRate: number;
}

const sampleBytes = 4;

const fixtures = path.dirname(
	createRequire(import.meta.url).resolve('@xsynaptic/plazmoid-wavedata/fixtures/v1/golden.json'),
);

function expand(runs: ReadonlyArray<Run>): Array<number> {
	return runs.flatMap((run) => Array.from({ length: run.samples }, () => run.value));
}

function interleave({ input, sampleCount }: Golden): Buffer {
	const channels = [input.mono, input.low, input.mid, input.high].map((runs) => expand(runs));
	const buffer = Buffer.alloc(sampleCount * channels.length * sampleBytes);

	for (const [channel, values] of channels.entries()) {
		expect(values).toHaveLength(sampleCount);

		for (const [sample, value] of values.entries()) {
			buffer.writeFloatLE(value, (sample * channels.length + channel) * sampleBytes);
		}
	}

	return buffer;
}

test('the writer reduces the golden input to the committed files, byte for byte', async () => {
	const [goldenText, peaks, bands] = await Promise.all([
		readFile(path.join(fixtures, 'golden.json'), 'utf8'),
		readFile(path.join(fixtures, 'peaks.bin')),
		readFile(path.join(fixtures, 'bands.bin')),
	]);
	const golden = JSON.parse(goldenText) as Golden;
	const input = interleave(golden);
	const reducer = createAnalysisReducer();

	reducer.push(input.subarray(0, 4099));
	reducer.push(input.subarray(4099));

	const { fields, levels } = reducer.finish();

	expect(Buffer.from(buildPeaks(fields, golden.sampleRate)).toString('hex')).toBe(
		peaks.toString('hex'),
	);
	expect(Buffer.from(buildBands(levels, golden.sampleRate)).toString('hex')).toBe(
		bands.toString('hex'),
	);
});
