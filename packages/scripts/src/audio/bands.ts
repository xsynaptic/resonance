import {
	bandCount,
	bandsDecibelRange,
	bandsHeaderBytes,
	samplesPerFrame,
} from '@xsynaptic/shared/waveform-format';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'zx';

import { openWaveformsCache } from '#audio/audio-sources.ts';
import { collectHashedOutputs, landHashedOutput } from '#audio/hashed-outputs.ts';
import { runBatchStep } from '#shared/batch-run.ts';
import { hashFile, readFileHead, requireBinaries } from '#shared/utils.ts';

const concurrency = 6;
const bandsExtension = '.bands';
const tmpExtension = '.bands.tmp';

const bandsPattern = /^(?<base>.+)\.[0-9a-f]{12}\.bands$/;

const bandsVersion = 1;
const rmsDecibelsKind = 1;

const bandEdges = [200, 2000] as const;

const sampleBytes = 4;
const sampleSetBytes = bandCount * sampleBytes;

export interface BandsHeader {
	frameCount: number;
	sampleRate: number;
}

export interface BandReducer {
	finish: () => Buffer;
	push: (chunk: Buffer) => void;
}

interface BandsJob {
	base: string;
	existing: string | undefined;
	source: string;
}

interface BandsOptions {
	dryRun?: boolean;
	rootPath: string;
}

export async function collectBands(cacheDir: string): Promise<Map<string, string>> {
	return collectHashedOutputs(cacheDir, bandsPattern, 'band files');
}

async function analyzeBands(source: string): Promise<Buffer> {
	const sampleRate = await readSampleRate(source);
	// The explicit mono mix matches audiowaveform; ffmpeg's default downmix is 1.41 times louder than the archive
	const filter = `[0:a]pan=mono|c0=0.5*c0+0.5*c1,acrossover=split=${bandEdges.join(' ')}:order=4th[low][mid][high];[low][mid][high]amerge=inputs=${String(bandCount)}[bands]`;
	const reducer = createBandReducer();

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
				'[bands]',
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

	return buildBands(reducer.finish(), sampleRate);
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

export function createBandReducer(): BandReducer {
	const levels: Array<number> = [];
	const sumOfSquares = Array.from({ length: bandCount }, () => 0);
	let samplesInFrame = 0;
	let carry: Buffer = Buffer.alloc(0);

	const closeFrame = (): void => {
		for (let band = 0; band < bandCount; band += 1) {
			levels.push(encodeBandLevel((sumOfSquares[band] ?? 0) / samplesInFrame));
			sumOfSquares[band] = 0;
		}
		samplesInFrame = 0;
	};

	return {
		finish: () => {
			if (samplesInFrame > 0) closeFrame();
			return Buffer.from(levels);
		},
		push: (chunk) => {
			const data = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
			const sampleSets = Math.floor(data.length / sampleSetBytes);

			for (let sampleSet = 0; sampleSet < sampleSets; sampleSet += 1) {
				for (let band = 0; band < bandCount; band += 1) {
					const value = data.readFloatLE(sampleSet * sampleSetBytes + band * sampleBytes);
					sumOfSquares[band] = (sumOfSquares[band] ?? 0) + value * value;
				}

				samplesInFrame += 1;
				if (samplesInFrame === samplesPerFrame) closeFrame();
			}

			carry = data.subarray(sampleSets * sampleSetBytes);
		},
	};
}

// sonic-ui reads a frame of three zeros as not loaded, so 0 is kept for digital silence
function encodeBandLevel(meanSquare: number): number {
	if (meanSquare === 0) return 0;

	const decibels = 10 * Math.log10(meanSquare);
	const level = Math.round(255 * (1 + decibels / bandsDecibelRange));

	return Math.min(255, Math.max(1, level));
}

export async function generateBands(options: BandsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const { cacheDir, sources } = await openWaveformsCache(rootPath, tmpExtension);
	const existing = await collectBands(cacheDir);

	const jobs = sources.map((source): BandsJob => ({
		base: source.base,
		existing: existing.get(source.base),
		source: source.path,
	}));

	const currency = await Promise.all(jobs.map((job) => isJobCurrent(job, cacheDir)));
	const pending = jobs.filter((_job, index) => currency[index] !== true);

	await runBatchStep({
		concurrency,
		describe: (job) => `analyze: ${job.base}`,
		dryRun,
		label: 'Bands',
		noun: 'band file',
		pending,
		prepare: () => requireBinaries(['ffmpeg', 'ffprobe'], 'ffmpeg'),
		run: (job) => analyze(job, cacheDir),
		skipped: jobs.length - pending.length,
		verb: { infinitive: 'analyze', past: 'analyzed' },
	});
}

export function parseBandsHeader(buffer: Buffer): BandsHeader {
	if (buffer.length < bandsHeaderBytes) throw new Error('Band data is shorter than its header');

	const expected: Array<[name: string, offset: number, value: number]> = [
		['version', 0, bandsVersion],
		['samples per frame', 8, samplesPerFrame],
		['band count', 16, bandCount],
		['first band edge', 20, bandEdges[0]],
		['second band edge', 24, bandEdges[1]],
		['value kind', 28, rmsDecibelsKind],
		['decibel range', 32, bandsDecibelRange],
	];

	for (const [name, offset, value] of expected) {
		const found = buffer.readUInt32LE(offset);

		if (found !== value) {
			throw new Error(`Band data has ${name} ${String(found)}, expected ${String(value)}`);
		}
	}

	return { frameCount: buffer.readUInt32LE(12), sampleRate: buffer.readInt32LE(4) };
}

export async function readBandsHeader(file: string): Promise<BandsHeader> {
	return parseBandsHeader(await readFileHead(file, bandsHeaderBytes));
}

async function analyze(job: BandsJob, cacheDir: string): Promise<string> {
	const tmp = path.join(cacheDir, `${job.base}${tmpExtension}`);

	await fs.writeFile(tmp, await analyzeBands(job.source));

	const name = `${job.base}.${await hashFile(tmp)}${bandsExtension}`;

	await landHashedOutput(tmp, cacheDir, { existing: job.existing, name });

	return name;
}

async function isJobCurrent(job: BandsJob, cacheDir: string): Promise<boolean> {
	if (job.existing === undefined) return false;

	const file = path.join(cacheDir, job.existing);

	try {
		const [fileStat, sourceStat, header] = await Promise.all([
			fs.stat(file),
			fs.stat(job.source),
			readBandsHeader(file),
		]);

		return (
			fileStat.mtimeMs >= sourceStat.mtimeMs &&
			fileStat.size === bandsHeaderBytes + header.frameCount * bandCount
		);
	} catch {
		return false;
	}
}

async function readSampleRate(source: string): Promise<number> {
	const result =
		await $`ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=nw=1:nk=1 ${source}`.quiet();
	const sampleRate = Number(result.stdout.trim());

	if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
		throw new Error(`No sample rate from ffprobe for ${path.basename(source)}`);
	}

	return sampleRate;
}
