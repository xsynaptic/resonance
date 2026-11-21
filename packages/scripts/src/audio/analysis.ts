import { readSubprocess } from '@xsynaptic/astro-scripts';
import { bandCount } from '@xsynaptic/shared/waveform-format';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { bandEdges, buildBands, createBandAccumulator } from '#audio/bands.ts';
import { buildPeaks, createPairAccumulator } from '#audio/peaks.ts';

// The mono mix, then the low, mid and high bands split from it
const channelCount = 1 + bandCount;
const sampleBytes = 4;
const sampleSetBytes = channelCount * sampleBytes;

export interface AnalysisReducer {
	finish: () => { fields: Buffer; levels: Buffer };
	push: (chunk: Buffer) => void;
}

export interface MixAnalysis {
	bands: Buffer;
	peaks: Buffer;
}

export async function analyzeMix(source: string): Promise<MixAnalysis> {
	const sampleRate = await readSampleRate(source);
	// An equal-weight mono mix; ffmpeg's default downmix is 1.41 times louder and would clip the peaks
	const filter = `[0:a]pan=mono|c0=0.5*c0+0.5*c1,asplit=2[full][split];[split]acrossover=split=${bandEdges.join(' ')}:order=4th[low][mid][high];[full][low][mid][high]amerge=inputs=${String(channelCount)}[analysis]`;
	const reducer = createAnalysisReducer();

	await new Promise<void>((resolve, reject) => {
		const ffmpeg = spawn(
			'ffmpeg',
			[
				'-nostdin',
				'-v',
				'error',
				'-vn',
				'-i',
				source,
				'-filter_complex',
				filter,
				'-map',
				'[analysis]',
				'-f',
				'f32le',
				'-',
			],
			{ stdio: ['ignore', 'pipe', 'inherit'] },
		);

		ffmpeg.stdout.on('data', reducer.push);
		ffmpeg.on('error', reject);
		ffmpeg.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`ffmpeg exited ${String(code)} on ${path.basename(source)}`));
				return;
			}
			resolve();
		});
	});

	const { fields, levels } = reducer.finish();

	return { bands: buildBands(levels, sampleRate), peaks: buildPeaks(fields, sampleRate) };
}

export function createAnalysisReducer(): AnalysisReducer {
	const pairs = createPairAccumulator();
	const bands = createBandAccumulator();
	let carry: Buffer = Buffer.alloc(0);

	return {
		finish: () => ({ fields: pairs.finish(), levels: bands.finish() }),
		push: (chunk) => {
			const data = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
			const sampleSets = Math.floor(data.length / sampleSetBytes);

			for (let sampleSet = 0; sampleSet < sampleSets; sampleSet += 1) {
				const offset = sampleSet * sampleSetBytes;

				pairs.add(data.readFloatLE(offset));
				bands.add(
					data.readFloatLE(offset + sampleBytes),
					data.readFloatLE(offset + sampleBytes * 2),
					data.readFloatLE(offset + sampleBytes * 3),
				);
			}

			carry = data.subarray(sampleSets * sampleSetBytes);
		},
	};
}

async function readSampleRate(source: string): Promise<number> {
	const result = await readSubprocess([
		'ffprobe',
		'-v',
		'error',
		'-select_streams',
		'a:0',
		'-show_entries',
		'stream=sample_rate',
		'-of',
		'default=nw=1:nk=1',
		source,
	]);
	const sampleRate = Number(result.stdout.trim());

	if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
		throw new Error(`No sample rate from ffprobe for ${path.basename(source)}`);
	}

	return sampleRate;
}
