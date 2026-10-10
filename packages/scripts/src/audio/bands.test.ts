import { bandCount, bandsHeaderBytes, samplesPerFrame } from '@xsynaptic/shared/waveform-format';
import { describe, expect, test } from 'vitest';

import { buildBands, createBandReducer, parseBandsHeader } from '#audio/bands.ts';

type BandSignal = (sample: number) => number;

const silence: BandSignal = () => 0;

function steady(amplitude: number): BandSignal {
	return () => amplitude;
}

function sine(amplitude: number): BandSignal {
	return (sample) => amplitude * Math.sin((2 * Math.PI * 8 * sample) / samplesPerFrame);
}

function interleave(signals: [BandSignal, BandSignal, BandSignal], samples: number): Buffer {
	const buffer = Buffer.alloc(samples * bandCount * 4);

	for (let sample = 0; sample < samples; sample += 1) {
		for (const [band, signal] of signals.entries()) {
			buffer.writeFloatLE(signal(sample), (sample * bandCount + band) * 4);
		}
	}

	return buffer;
}

function reduce(buffer: Buffer, chunkBytes = buffer.length): Array<number> {
	const reducer = createBandReducer();

	for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
		reducer.push(buffer.subarray(offset, offset + chunkBytes));
	}

	return [...reducer.finish()];
}

describe('createBandReducer', () => {
	test('stores each band as RMS decibels across a 60 dB range', () => {
		const levels = reduce(interleave([sine(1), steady(0.1), steady(1)], samplesPerFrame));

		expect(levels).toEqual([242, 170, 255]);
	});

	test('keeps 0 for digital silence and lifts any real signal to 1', () => {
		const levels = reduce(interleave([silence, steady(1e-5), steady(0.001)], samplesPerFrame));

		expect(levels).toEqual([0, 1, 1]);
	});

	test('clamps a band over full scale', () => {
		const levels = reduce(interleave([steady(2), silence, silence], samplesPerFrame));

		expect(levels).toEqual([255, 0, 0]);
	});

	test('cuts one frame per 1,024 samples and keeps the short last one', () => {
		const loudThenQuiet: BandSignal = (sample) => (sample < samplesPerFrame ? 1 : 0.1);
		const levels = reduce(interleave([loudThenQuiet, silence, silence], samplesPerFrame * 2 + 100));

		expect(levels).toEqual([255, 0, 0, 170, 0, 0, 170, 0, 0]);
	});

	test('gives the same levels however the stream is chunked', () => {
		const buffer = interleave([sine(0.5), steady(0.25), sine(0.01)], samplesPerFrame * 3 + 17);

		expect(reduce(buffer, 4099)).toEqual(reduce(buffer));
	});
});

describe('buildBands', () => {
	test('writes a header its parser reads back, with frame zero at the shared offset', () => {
		const levels = Buffer.from([10, 20, 30, 40, 50, 60]);
		const file = buildBands(levels, 48_000);

		expect(parseBandsHeader(file)).toEqual({ frameCount: 2, sampleRate: 48_000 });
		expect([...file.subarray(bandsHeaderBytes)]).toEqual([...levels]);
	});

	test('rejects a file cut with a different frame size', () => {
		const file = buildBands(Buffer.from([1, 2, 3]), 44_100);

		file.writeInt32LE(512, 8);

		expect(() => parseBandsHeader(file)).toThrow('samples per frame 512');
	});

	test('rejects a file shorter than its header', () => {
		expect(() => parseBandsHeader(Buffer.alloc(bandsHeaderBytes - 1))).toThrow('shorter');
	});
});
