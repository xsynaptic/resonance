import { fc, test } from '@fast-check/vitest';
import { bandCount, samplesPerFrame, samplesPerPair } from '@xsynaptic/shared/waveform-format';
import { describe, expect } from 'vitest';

import { createAnalysisReducer } from '#audio/analysis.ts';

type Signal = (sample: number) => number;

const channelCount = 1 + bandCount;

const silence: Signal = () => 0;

function steady(amplitude: number): Signal {
	return () => amplitude;
}

function sine(amplitude: number): Signal {
	return (sample) => amplitude * Math.sin((2 * Math.PI * 8 * sample) / samplesPerFrame);
}

function interleave(signals: [Signal, Signal, Signal, Signal], samples: number): Buffer {
	const buffer = Buffer.alloc(samples * channelCount * 4);

	for (let sample = 0; sample < samples; sample += 1) {
		for (const [channel, signal] of signals.entries()) {
			buffer.writeFloatLE(signal(sample), (sample * channelCount + channel) * 4);
		}
	}

	return buffer;
}

function reduceInChunks(buffer: Buffer, splits: ReadonlyArray<number> = []) {
	const reducer = createAnalysisReducer();
	const edges = [0, ...splits, buffer.length];

	const starts = edges.slice(0, -1);

	for (const [index, start] of starts.entries()) {
		reducer.push(buffer.subarray(start, edges[index + 1]));
	}

	return reducer.finish();
}

function pairsOf(signal: Signal, samples: number): Array<number> {
	return [
		...new Int8Array(
			reduceInChunks(interleave([signal, silence, silence, silence], samples)).fields,
		),
	];
}

function levelsOf(bands: [Signal, Signal, Signal], samples: number): Array<number> {
	return [...reduceInChunks(interleave([silence, ...bands], samples)).levels];
}

function toBuffer(view: Float32Array): Buffer {
	return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

function encodeReference(value: number): number {
	return Math.min(127, Math.max(-128, Math.trunc(value * 128)));
}

// Written from the definition, one pair at a time over the whole mono channel
function bruteForcePairs(mono: ReadonlyArray<number>): Array<number> {
	const fields: Array<number> = [];

	for (let start = 0; start < mono.length; start += samplesPerPair) {
		const pair = mono.slice(start, start + samplesPerPair);
		const meanSquare = pair.reduce((sum, value) => sum + value * value, 0) / pair.length;

		fields.push(
			encodeReference(Math.min(...pair)),
			encodeReference(Math.max(...pair)),
			encodeReference(Math.sqrt(meanSquare)),
		);
	}

	return fields;
}

const sampleSets = fc
	.array(fc.float({ max: Math.fround(1.5), min: Math.fround(-1.5), noNaN: true }), {
		maxLength: (samplesPerFrame * 3 + 300) * channelCount,
		minLength: samplesPerFrame * channelCount,
	})
	.map((values) => values.slice(0, values.length - (values.length % channelCount)));

const bufferWithSplitPoints = sampleSets.chain((values) => {
	const buffer = toBuffer(Float32Array.from(values));

	return fc.record({
		buffer: fc.constant(buffer),
		splits: fc
			.uniqueArray(fc.nat({ max: buffer.length }), { maxLength: 3, minLength: 2 })
			.map((points) => points.toSorted((first, second) => first - second)),
	});
});

describe('createAnalysisReducer', () => {
	test.prop([bufferWithSplitPoints])(
		'writes the same pairs and levels wherever the input is split into chunks',
		({ buffer, splits }) => {
			const whole = reduceInChunks(buffer);
			const split = reduceInChunks(buffer, splits);

			expect(Buffer.compare(split.fields, whole.fields)).toBe(0);
			expect(Buffer.compare(split.levels, whole.levels)).toBe(0);
		},
	);

	test.prop([sampleSets])(
		'reduces the mono channel to the min, max and RMS of each pair',
		(values) => {
			const buffer = toBuffer(Float32Array.from(values));
			const mono = values.filter((_value, index) => index % channelCount === 0);

			expect(new Int8Array(reduceInChunks(buffer).fields)).toEqual(
				Int8Array.from(bruteForcePairs(mono)),
			);
		},
	);

	test('reads a full-scale sine as its peaks with a body at 1/√2', () => {
		expect(pairsOf(sine(1), samplesPerPair)).toEqual([-128, 127, 90]);
	});

	test('clamps a pair over full scale and keeps a flat signal as one value', () => {
		expect(pairsOf(steady(-2), samplesPerPair)).toEqual([-128, -128, 127]);
		expect(pairsOf(steady(0.5), samplesPerPair)).toEqual([64, 64, 64]);
	});

	test('cuts one pair per 256 samples and keeps the short last one', () => {
		const loudThenQuiet: Signal = (sample) => (sample < samplesPerPair ? 0.5 : -0.25);

		expect(pairsOf(loudThenQuiet, samplesPerPair + 10)).toEqual([64, 64, 64, -32, -32, 32]);
	});

	test('stores each band as RMS decibels across a 60 dB range', () => {
		expect(levelsOf([sine(1), steady(0.1), steady(1)], samplesPerFrame)).toEqual([242, 170, 255]);
	});

	test('keeps 0 for digital silence and lifts any real signal to 1', () => {
		expect(levelsOf([silence, steady(1e-5), steady(0.001)], samplesPerFrame)).toEqual([0, 1, 1]);
	});

	test('clamps a band over full scale', () => {
		expect(levelsOf([steady(2), silence, silence], samplesPerFrame)).toEqual([255, 0, 0]);
	});

	test('cuts one frame per 1,024 samples and keeps the short last one', () => {
		const loudThenQuiet: Signal = (sample) => (sample < samplesPerFrame ? 1 : 0.1);

		expect(levelsOf([loudThenQuiet, silence, silence], samplesPerFrame * 2 + 100)).toEqual([
			255, 0, 0, 170, 0, 0, 170, 0, 0,
		]);
	});
});
